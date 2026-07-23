<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue';
import {useRoute} from 'vue-router';
import {
  NButton,
  NCheckbox,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSpace,
  NTabs,
  NTabPane,
  NIcon,
  NTable,
  NIconWrapper,
  NTag,
  useMessage,
} from 'naive-ui';
import TripJoinAuth from '@/components/trip/TripJoinAuth.vue';
import ScanReceiptModal from '@/components/trip/ScanReceiptModal.vue';
import ManualPositionModal from '@/components/trip/ManualPositionModal.vue';
import EditLineModal from '@/components/trip/EditLineModal.vue';
import RoomQrCodeModal from '@/components/trip/RoomQrCodeModal.vue';
import {apiFetch, clearLastTripSlug, setLastTripSlug, setSessionToken} from '@/api/client';
import {useTripSocket} from '@/composables/useTripSocket';
import {formatRub} from '@/utils/money';
import {QrCodeOutline, Add, CopyOutline, Checkmark, LockClosedOutline, LockOpenOutline} from '@vicons/ionicons5'
import {useClipboard} from "@vueuse/core";

const props = defineProps<{ slug: string }>();
const route = useRoute();
const message = useMessage();

const slug = computed(() => props.slug || (route.params.slug as string) || '');

type TripPayload = {
  trip: {
    id: string;
    slug: string;
    name: string;
    finishedAt: string | null;
  };
  me: { participantId: string; isAdmin: boolean } | null;
  participants: {
    id: string;
    name: string;
    phone: string;
    bank: string;
    isAdmin: boolean;
  }[];
  receipts: {
    id: string;
    institution: string;
    officialTotalKopecks: number;
    payerId: string;
    payerName: string;
    isManual: boolean;
  }[];
  lineItems: {
    id: string;
    receiptId: string;
    name: string;
    unit: string | null;
    quantity: number;
    priceKopecks: number;
    forcedForAll: boolean;
    selectedCount: number;
    mySelected: boolean;
  }[];
};

const state = ref<TripPayload | null>(null);
const loading = ref(true);
const refreshing = ref(false);

const tabKey = computed(() => `splich_active_tab:${slug.value}`);
const activeTab = ref('p3');
const {text, copy, copied, isSupported} = useClipboard()
watch(
    tabKey,
    (k) => {
      activeTab.value = sessionStorage.getItem(k) ?? 'p3';
    },
    {immediate: true},
);
watch(
    activeTab,
    (v) => {
      if (!tabKey.value) return;
      sessionStorage.setItem(tabKey.value, v);
    },
    {flush: 'post'},
);


async function load() {
  // Не размонтируем UI при обновлении данных — иначе табы сбрасываются.
  if (!state.value) loading.value = true;
  else refreshing.value = true;
  try {
    state.value = await apiFetch<TripPayload>(`/api/trips/${encodeURIComponent(slug.value)}`);
    // Запоминаем комнату для возврата из PWA (start_url всегда /)
    if (state.value.me && slug.value) {
      setLastTripSlug(slug.value);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка загрузки';
    // Только «не найдено» — иначе сетевой сбой сотрёт last trip
    if (msg === 'Не найдено') {
      clearLastTripSlug();
    }
    message.error(msg);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

watch(slug, load, {immediate: true});

useTripSocket(
    () => state.value?.trip.id,
    () => {
      void load();
    },
);


const showScan = ref(false);


const showManual = ref(false);

async function toggleLine(id: string) {
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(slug.value)}/line-items/${id}/toggle`, {
      method: 'POST',
    });
    // Оптимистично обновляем локально (и не сбрасываем табы).
    if (state.value) {
      const li = state.value.lineItems.find((x) => x.id === id);
      if (li && !li.forcedForAll) {
        li.mySelected = !li.mySelected;
        li.selectedCount = Math.max(0, li.selectedCount + (li.mySelected ? 1 : -1));
      }
    }
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

const productSearch = ref('');
const hideSelected = ref(false);
const hideSelectedAll = ref(true);
const receiptFilter = ref<string[] | null>(null);

const filteredProducts = computed(() => {
  const s = state.value;
  if (!s) return [];
  let rows = [...s.lineItems];
  const rf = receiptFilter.value;
  if (rf && rf.length > 0) rows = rows.filter((l) => rf.includes(l.receiptId));
  const q = productSearch.value.trim().toLowerCase();
  if (q) rows = rows.filter((l) => l.name.toLowerCase().includes(q));
  if (hideSelected.value) rows = rows.filter((l) => !l.mySelected);
  if (hideSelectedAll.value) rows = rows.filter((l) => !l.forcedForAll);
  rows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return rows;
});

const receiptOptions = computed(() =>
    (state.value?.receipts ?? []).map((r) => ({
      label: `${r.institution} — ${formatRub(r.officialTotalKopecks)}`,
      value: r.id,
    })),
);

async function finishTrip() {
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(slug.value)}/finish`, {method: 'POST'});
    message.success('Поездка закрыта');
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

const settlement = ref<{
  participantIds: string[];
  names: Record<string, Record<string, string>>;
  kopecks: number[][];
} | null>(null);

async function loadSettlement() {
  try {
    settlement.value = await apiFetch(`/api/trips/${encodeURIComponent(slug.value)}/settlement`);
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

watch(
    () => activeTab.value,
    (v) => {
      if (v === 'p4') void loadSettlement();
    },
);

watch(copied, (newVal) => {
  if (newVal) {
    message.success('Скопировано!')
    // Здесь можно вызвать ваш Toast или Alert
  }
})


onMounted(() => {
  if(state.value?.me){
    loadSettlement();
  }
})

const expandedReceipt = ref<string | null>(null);
const roomQrCodeModal = ref(false);
const selectedLineItemId = ref<string | null>(null);
const showEditLine = computed(() => selectedLineItemId.value !== null);

const selectedLineItem = computed(() => {
  const id = selectedLineItemId.value;
  return id && state.value ? state.value.lineItems.find((x) => x.id === id) ?? null : null;
});

const selectedLineReceipt = computed(() => {
  const li = selectedLineItem.value;
  if (!li || !state.value) return null;
  return state.value.receipts.find((r) => r.id === li.receiptId) ?? null;
});

const canEditSelectedLine = computed(() => {
  const s = state.value;
  const r = selectedLineReceipt.value;
  if (!s?.me || !r) return false;
  if (s.trip.finishedAt) return false;
  return s.me.isAdmin || r.payerId === s.me.participantId;
});

async function logOut() {
  try {
    setSessionToken(null);
    // Перезагружаем состояние комнаты: покажется форма входа
    await load();
  } catch {
    // ignore
  }
}

function openQrCodeModal() {
  roomQrCodeModal.value = true;
}

function openEditLine(lineId: string) {
  selectedLineItemId.value = lineId;
}

function closeEditLine() {
  selectedLineItemId.value = null;
}

// edit actions moved into EditLineModal component

const shareUrl = computed(() =>
    typeof location !== 'undefined' ? `${location.origin}/t/${slug.value}` : '',
);

const renameTrip = ref('');
watch(
    () => state.value?.trip.name,
    (n) => {
      if (n) renameTrip.value = n;
    },
    {immediate: true},
);

async function saveTripName() {
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(slug.value)}`, {
      method: 'PATCH',
      json: {name: renameTrip.value},
    });
    message.success('Сохранено');
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

async function removeParticipant(id: string) {
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(slug.value)}/participants/${id}`, {
      method: 'DELETE',
    });
    message.success('Участник удалён');
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

const participantSelectOptions = computed(() =>
  (state.value?.participants ?? []).map((p) => ({
    label: p.name,
    value: p.id,
  })),
);

async function changeReceiptPayer(receiptId: string, payerId: string) {
  const rec = state.value?.receipts.find((r) => r.id === receiptId);
  if (!rec || rec.payerId === payerId) return;
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(slug.value)}/receipts/${receiptId}`, {
      method: 'PATCH',
      json: { payerId },
    });
    message.success('Плательщик обновлён');
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

async function setForced(lineId: string, v: boolean) {
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(slug.value)}/line-items/${lineId}`, {
      method: 'PATCH',
      json: {forcedForAll: v},
    });
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

async function copyShareUrl() {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl.value);
      message.success('Ссылка скопирована');
    }
  } catch {
    // Если clipboard недоступен — молча проигнорируем
  }
}
</script>

<template>
  <div v-if="loading" class="page">Загрузка…</div>
  <div v-else-if="state && !state.me" class="page">
    <TripJoinAuth :slug="slug" @joined="load"/>
  </div>
  <div v-else-if="state" class="page trip">
    <header class="hdr glass">
      <div>
        <div class="kicker muted">Комната</div>
        <h1>{{ state.trip.name }}</h1>
        <div class="muted small">Код: <code>{{ state.trip.slug }}</code></div>
      </div>
      <div class="hdr-actions">

        <NButton size="small" secondary @click="copyShareUrl">
          Скопировать ссылку
        </NButton>
        <NButton size="small" secondary @click="openQrCodeModal">
          Показать qr-код
        </NButton>
        <NButton size="small" secondary @click="logOut" type="error">
          Выйти
        </NButton>

      </div>
    </header>

    <NTabs v-model:value="activeTab" type="line" default-value="p1" animated justify-content="space-evenly"
           :bar-width="28">
      <NTabPane name="p1" tab="Участники">
        <ul class="list">
          <li v-for="p in state.participants" :key="p.id">
            <strong>{{ p.name }}</strong>
            <span v-if="p.isAdmin" class="badge">админ</span>
            <div class="small">{{ p.phone }} · {{ p.bank }}</div>
          </li>
        </ul>
      </NTabPane>
      <NTabPane name="p2" tab="Чеки">
        <div class="toolbar glass">
          <NSpace justify="space-around">
            <NButton quaternary title="Добавить вручную" @click="showManual = true">
              <template #icon>
                <NIcon>
                  <Add/>
                </NIcon>
              </template>
              Вручную
            </NButton>
            <NButton quaternary title="QR / ФН" @click="showScan = true">
              <template #icon>
                <NIcon>
                  <QrCodeOutline/>
                </NIcon>
              </template>
              Чек
            </NButton>
          </NSpace>
          <span v-if="refreshing" class="muted small" style="margin-left: 8px">обновление…</span>
        </div>
        <div v-for="r in state.receipts" :key="r.id" class="receipt">
          <div class="receipt-h" @click="expandedReceipt = expandedReceipt === r.id ? null : r.id">
            <span>{{ r.institution }}</span>
            <span>{{ formatRub(r.officialTotalKopecks) }} · {{ r.payerName }}</span>
          </div>
          <ul v-if="expandedReceipt === r.id" class="receipt-body">
            <li v-for="li in state.lineItems.filter((x) => x.receiptId === r.id)" :key="li.id">
              <button class="li-btn" type="button" @click="openEditLine(li.id)">
                <span>{{ li.name }}</span>
                <span class="muted">{{ formatRub(li.priceKopecks) }}</span>
              </button>
            </li>
          </ul>
        </div>
      </NTabPane>
      <NTabPane name="p3" tab="Продукты">
        <div class="filters glass">
          <NInput v-model:value="productSearch" placeholder="Поиск по товарам" clearable/>
          <NSpace style="margin-top: 10px" wrap>
            <div class="checkbox-container">
              <NCheckbox v-model:checked="hideSelected">Скрыть отмеченные мной</NCheckbox>
              <NCheckbox v-model:checked="hideSelectedAll">Скрыть выбранные для всех</NCheckbox>
            </div>

            <NSelect
                v-model:value="receiptFilter"
                multiple
                clearable
                placeholder="Фильтр по чекам"
                :options="receiptOptions"
                style="min-width: 220px"
            />
          </NSpace>
        </div>
        <div v-for="li in filteredProducts" :key="li.id" class="prod-row">
          <NTag round v-if="!li.forcedForAll"
                :disabled="!!state.trip.finishedAt"
                :type="li.mySelected ?
                  'success'
                  : 'info'"
                :bordered="!li.mySelected"
                @click="() => toggleLine(li.id)">
            {{ li.selectedCount }}
            <template #icon>
              <n-icon :component="Checkmark"/>
            </template>
          </NTag>
          <NTag round v-else
                :disabled="true"
                type="info"
                :bordered="false">
            {{ li.selectedCount }}
            <template #icon>
              <n-icon :component="LockClosedOutline"/>
            </template>
          </NTag>
          <span class="prod-name">{{ li.name }}</span>
          <span class="prod-meta">{{ formatRub(li.priceKopecks) }}</span>
          <NButton
              v-if="state.me?.isAdmin && !state.trip.finishedAt"
              size="tiny"
              circle
              secondary
              strong
              :type="li.forcedForAll ? 'warning' : 'primary'"
              @click="setForced(li.id, !li.forcedForAll)"
          >
            <template #icon>
              <NIcon>
                <LockClosedOutline v-if="li.forcedForAll"/>
                <LockOpenOutline v-else></LockOpenOutline>
              </NIcon>
            </template>
          </NButton>
        </div>
      </NTabPane>
      <NTabPane name="p4" tab="Финал">
        <div class="head-container">
          <NButton size="small" @click="loadSettlement">Обновить матрицу</NButton>
          <span class="muted" v-if="!state.trip.finishedAt">Поездка еще не закрыта, не переводите деньги!</span>
        </div>

        <div class="table-container">
          <NTable v-if="settlement && state.me" class="matrix" :striped="true">
            <thead>
            <tr>
              <th></th>
              <th v-for="pid in settlement.participantIds" :key="pid">
                <div class="user-info">
                  {{ settlement.names[pid].name ?? pid }}
                </div>

              </th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(rowId, i) in settlement.participantIds" :key="rowId">
              <th>{{ settlement.names[rowId].name ?? rowId }}</th>
              <td v-for="(colId, j) in settlement.participantIds" :key="colId">
                <span v-if="settlement.kopecks[i]?.[j] !== 0">{{ formatRub(settlement.kopecks[i]?.[j] ?? 0) }}</span>
                <span v-else></span>
              </td>
            </tr>
            <tr>
              <th>Реквизиты</th>
              <th v-for="pid in settlement.participantIds" :key="pid">
                <div class="user-info" v-if="settlement.names[pid].bank && settlement.names[pid].phone">
                  {{ settlement.names[pid].bank ?? '' }}
                  <code @click="copy('+'+settlement.names[pid].phone)">
                    <n-icon size="10" :component="CopyOutline"/>
                    +{{ settlement.names[pid].phone ?? '' }}
                  </code>
                </div>

              </th>
            </tr>
            </tbody>
          </NTable>
        </div>

        <p v-if="settlement && state.me" class="muted" style="margin-top: 1rem">
          Строка — кто должен; колонка — кому. Нули на диагонали.
        </p>

      </NTabPane>
      <NTabPane v-if="state.me?.isAdmin" name="p5" tab="Админ">
        <div class="glass admin">
          <p style="margin-top: 0">Ссылка: <code>{{ shareUrl }}</code></p>
          <NForm label-placement="top" style="max-width: 360px; margin: 1rem 0">
            <NFormItem label="Название поездки">
              <NSpace>
                <NInput v-model:value="renameTrip"/>
                <NButton @click="saveTripName">Сохранить</NButton>
              </NSpace>
            </NFormItem>
          </NForm>
          <template v-if="!state.trip.finishedAt">
            <h3 class="admin-section-title">Плательщики чеков</h3>
            <div v-if="state.receipts.length === 0" class="muted small">Пока нет чеков</div>
            <ul v-else class="list payer-list">
              <li v-for="r in state.receipts" :key="r.id" class="payer-row">
                <div class="payer-meta">
                  <span>{{ r.institution }}</span>
                  <span class="muted">{{ formatRub(r.officialTotalKopecks) }}</span>
                </div>
                <NSelect
                    :value="r.payerId"
                    :options="participantSelectOptions"
                    style="min-width: 160px; max-width: 220px"
                    @update:value="(v: string) => changeReceiptPayer(r.id, v)"
                />
              </li>
            </ul>
            <ul class="list">
              <li
                  v-for="p in (state?.participants ?? []).filter((x) => x.id !== state?.me?.participantId)"
                  :key="p.id"
              >
                {{ p.name }}
                <NButton size="small" quaternary type="error" @click="removeParticipant(p.id)">Удалить</NButton>
              </li>
            </ul>
            <NButton type="error" ghost @click="finishTrip">Завершить поездку</NButton>
          </template>
        </div>
      </NTabPane>
    </NTabs>

    <ScanReceiptModal :slug="slug" v-model:show="showScan" @submitted="load"/>

    <ManualPositionModal :slug="slug" v-model:show="showManual" @submitted="load"/>

    <EditLineModal
        :slug="slug"
        :show="showEditLine"
        :line-id="selectedLineItemId"
        :receipt-institution="selectedLineReceipt?.institution || null"
        :payer-name="selectedLineReceipt?.payerName || null"
        :can-edit="canEditSelectedLine"
        :initial-name="selectedLineItem?.name || ''"
        :initial-price-rub="selectedLineItem ? selectedLineItem.priceKopecks / 100 : 0"
        @changed="load"
        @update:show="(v:boolean) => { if (!v) closeEditLine() }"
    />

    <RoomQrCodeModal v-model:show="roomQrCodeModal" :url="shareUrl"/>
  </div>
</template>

<style scoped>
.checkbox-container {
  display: flex;
  flex-direction: column;
}

.head-container {
  display: flex;
  gap: 1em;
  align-items: center;
}

code {
  font-size: 0.85rem;
  word-break: break-all;
  display: flex;
  align-items: center;
  gap: 0.1em;
  background: rgb(0 0 0 / 19%);
  border-radius: 5px;
  padding: 5px;
  cursor: pointer;
}

.table-container {
  overflow: auto;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.trip :deep(.n-tabs) {
  margin-top: 14px;
}

.trip :deep(.n-tabs .n-tabs-nav) {
  position: sticky;
  top: 0px;
  z-index: 10;
  backdrop-filter: blur(10px);
  border-radius: 0 10px;
}

.trip :deep(.n-tabs .n-tabs-nav-scroll-content) {
  padding: 10px 12px;
}

.hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 16px 14px;
}

.kicker {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hdr-actions {
  display: flex;
  gap: 10px;
  flex-direction: column;
  justify-content: center;
}

.hdr h1 {
  margin: 2px 0 4px;
  font-size: 20px;
  letter-spacing: -0.02em;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.list li {
  padding: 0.6rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.admin-section-title {
  margin: 1.25rem 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
}

.payer-list {
  margin-bottom: 1.25rem;
}

.payer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.payer-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.badge {
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.92);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  margin-left: 0.35rem;
}

.small {
  font-size: 0.85rem;
}

.receipt {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  margin-bottom: 0.5rem;
  overflow: hidden;
}

.receipt-h {
  display: flex;
  justify-content: space-between;
  padding: 12px 14px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.06);
}

.receipt-body {
  margin: 0;
  padding: 10px 14px 14px;
  list-style: disc;
  padding-left: 1.5rem;
  background: rgba(0, 0, 0, 0.14);
}

.li-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 6px 0;
}

.li-btn:hover {
  opacity: 0.92;
}

.filters {
  padding: 12px;
  margin-bottom: 10px;
}

.prod-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto auto;
  gap: 0.5rem;
  align-items: center;
  padding: 10px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.prod-name {
  font-size: 0.95rem;
  overflow: auto;
  white-space: nowrap;
}

.prod-meta {
  color: rgba(255, 255, 255, 0.76);
  font-size: 0.9rem;
}

.cnt {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.76);
}

.matrix {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.75rem;
  font-size: 0.85rem;
}

.matrix th,
.matrix td {
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 0.35rem 0.5rem;
  text-align: right;
}

.matrix th:first-child,
.matrix td:first-child {
  text-align: left;
}

.toolbar {
  margin-bottom: 0.75rem;
  padding: 10px 12px;
}

code {
  font-size: 0.85rem;
  word-break: break-all;
}

.admin {
  padding: 12px;
}

.qr-preview {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 10px;
}

.qr-video {
  display: block;
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  background: black;
}
</style>
