<script setup lang="ts">
import {computed, ref, watch, onBeforeUnmount, nextTick} from 'vue';
import {useRoute} from 'vue-router';
import {
  NButton,
  NCard,
  NCheckbox,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NTabs,
  NTabPane,
  NIcon,
  NImage,
  NInputGroupLabel,
  NInputGroup,
  useMessage,
} from 'naive-ui';
import {apiFetch, setSessionToken} from '@/api/client';
import QrScanner from 'qr-scanner';
import {useTripSocket} from '@/composables/useTripSocket';
import {formatRub} from '@/utils/money';
import { QrCodeOutline, Add } from '@vicons/ionicons5'
import { useQRCode } from '@vueuse/integrations/useQRCode'

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

const joinName = ref('');
const joinPassword = ref('');
const joinPhone = ref('');
const joinBank = ref('');
const joinRoomPass = ref('');

async function load() {
  // Не размонтируем UI при обновлении данных — иначе табы сбрасываются.
  if (!state.value) loading.value = true;
  else refreshing.value = true;
  try {
    state.value = await apiFetch<TripPayload>(`/api/trips/${encodeURIComponent(slug.value)}`);
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка загрузки');
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



async function doJoin() {
  try {
    const res = await apiFetch<{ sessionToken: string }>(
        `/api/trips/${encodeURIComponent(slug.value)}/join`,
        {
          method: 'POST',
          json: {
            name: joinName.value,
            password: joinPassword.value,
            phone: joinPhone.value,
            bank: joinBank.value,
            joinPassword: joinRoomPass.value || undefined,
          },
        },
    );
    setSessionToken(res.sessionToken);
    message.success('Вы в комнате');
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

const showScan = ref(false);
const scan = ref({
  fn: '',
  fd: '',
  fp: '',
  total: '',
  date: '',
  time: '',
});

// QR scanning state
const scanning = ref(false);
const qrVideo = ref<HTMLVideoElement | null>(null);
let qrScanner: QrScanner | null = null;
const qrFileInput = ref<HTMLInputElement | null>(null);

function applyParsed(p: { fn?: string; fd?: string; fp?: string; s?: string; t?: string }) {
  if (p.fn) scan.value.fn = p.fn.trim();
  if (p.fd) scan.value.fd = p.fd.trim();
  if (p.fp) scan.value.fp = p.fp.trim();
  if (p.s) {
    const num = Number(String(p.s).replace(',', '.'));
    if (!Number.isNaN(num)) scan.value.total = num.toFixed(2);
  }
  if (p.t) {
    // Expect formats like 20260406T201700, 20260406T201700Z, or 20260406T201700+0300
    const m = String(p.t).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    if (m) {
      const [_, y, mo, d, h, mi, s] = m;
      scan.value.date = `${y}-${mo}-${d}`;
      scan.value.time = `${h}:${mi}`;
    }
  }
}

function parseQrPayload(text: string) {
  // Parse key=value pairs separated by &. Example: t=20260406T201700&s=52355.66&fn=...&i=...&fp=...&n=1
  const out: Record<string, string> = {};
  const parts = text.trim().replace(/^\?/, '').split('&');
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (!k) continue;
    out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  const map = {fn: out.fn, fd: out.i, fp: out.fp, s: out.s, t: out.t};
  applyParsed(map);
}

async function onQrDetected(res: { data: string } | string) {
  try {
    const data = typeof res === 'string' ? res : res.data;
    if (!data) return;
    parseQrPayload(data);
    message.success('QR распознан — поля заполнены');
  } catch (e) {
    message.error('Не удалось распознать QR');
  } finally {
    // Stop after first successful detection to avoid duplicates
    await stopCameraScan();
  }
}

async function startCameraScan() {
  try {
    await nextTick();
    console.log('Starting QR scanner');
    if (!qrVideo.value) return;
    console.log('Starting QR scanner 1');
    await stopCameraScan();
    qrScanner = new QrScanner(qrVideo.value, (r) => void onQrDetected(r as unknown as { data: string }), {
      preferredCamera: 'environment',
      returnDetailedScanResult: true,
      highlightScanRegion: true,
      highlightCodeOutline: true,
    });
    await qrScanner.start();
    console.log('QR scanner started');
    scanning.value = true;
  } catch (e) {
    console.error('QR scanner error', e);
    message.error('Нет доступа к камере или она недоступна');
  }
}

async function stopCameraScan() {
  try {
    if (qrScanner) {
      await qrScanner.stop();
      qrScanner.destroy();
      qrScanner = null;
    }
  } finally {
    scanning.value = false;
  }
}

function triggerFilePick() {
  qrFileInput.value?.click();
}

async function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    const res = await QrScanner.scanImage(file, {returnDetailedScanResult: true});
    await onQrDetected(res as unknown as { data: string });
  } catch (e) {
    message.error('QR на изображении не найден');
  } finally {
    // reset input to allow re-selecting the same file
    if (input) input.value = '';
  }
}

watch(showScan, async (v) => {
  if (!v) await stopCameraScan();
});

onBeforeUnmount(async () => {
  await stopCameraScan();
});

async function submitScan() {
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(slug.value)}/receipts/scan`, {
      method: 'POST',
      json: scan.value,
    });
    message.success('Чек добавлен');
    showScan.value = false;
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Не удалось проверить чек');
  }
}

const showManual = ref(false);
const manualName = ref('');
const manualPrice = ref('');

async function submitManual() {
  const pr = Number(String(manualPrice.value).replace(',', '.'));
  if (Number.isNaN(pr)) return;
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(slug.value)}/receipts/manual`, {
      method: 'POST',
      json: {name: manualName.value, priceRub: pr},
    });
    message.success('Позиция добавлена');
    showManual.value = false;
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

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
  names: Record<string, string>;
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
    () => state.value?.trip.finishedAt,
    (v) => {
      if (v) void loadSettlement();
    },
);

const expandedReceipt = ref<string | null>(null);
const roomQrCodeModal = ref(false);
const selectedLineItemId = ref<string | null>(null);
const editLineName = ref('');
const editLinePriceRub = ref('');
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

function openQrCodeModal() {
  roomQrCodeModal.value = true;
}

function openEditLine(lineId: string) {
  if (!state.value) return;
  const li = state.value.lineItems.find((x) => x.id === lineId);
  if (!li) return;
  selectedLineItemId.value = lineId;
  editLineName.value = li.name;
  editLinePriceRub.value = String((li.priceKopecks / 100).toFixed(2));
}

function closeEditLine() {
  selectedLineItemId.value = null;
}

async function saveEditLine() {
  const id = selectedLineItemId.value;
  if (!id) return;
  const price = Number(String(editLinePriceRub.value).replace(',', '.'));
  if (Number.isNaN(price)) {
    message.error('Введите корректную цену');
    return;
  }
  const priceKopecks = Math.max(0, Math.round(price * 100));
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(slug.value)}/line-items/${id}`, {
      method: 'PATCH',
      json: {name: editLineName.value, priceKopecks},
    });
    message.success('Сохранено');
    closeEditLine();
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

async function deleteLine() {
  const id = selectedLineItemId.value;
  if (!id) return;
  try {
    await apiFetch(`/api/trips/${encodeURIComponent(slug.value)}/line-items/${id}`, {
      method: 'DELETE',
    });
    message.success('Удалено');
    closeEditLine();
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'Ошибка');
  }
}

const shareUrl = computed(() =>
    typeof location !== 'undefined' ? `${location.origin}/t/${slug.value}` : '',
);
const qrcode = useQRCode(shareUrl.value, {
  errorCorrectionLevel: 'H',
  margin: 3,
})

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
    <NCard title="Вход в комнату" class="glass">
      <NForm label-placement="top">
        <div class="form-container">
        <NFormItem label="Имя" :show-feedback="false">
          <NInput v-model:value="joinName"/>
        </NFormItem>
        <NFormItem
            label="Пароль участника (личный)"
            :show-feedback="false"
            tooltip="Это ваш личный пароль в этой поездке. По телефону + этому паролю вы сможете войти с другого устройства."
        >
          <NInput v-model:value="joinPassword" type="password" show-password-on="click"/>
        </NFormItem>
        <NFormItem label="Телефон" :show-feedback="false" tooltip="По телефону ищем вашу запись в этой комнате.">
          <NInputGroup>
            <NInputGroupLabel>+7</NInputGroupLabel>
            <NInput v-model:value="joinPhone"/>
          </NInputGroup>


        </NFormItem>
        <NFormItem label="Банк" :show-feedback="false" tooltip="Показывается в финале для переводов.">
          <NInput v-model:value="joinBank"/>
        </NFormItem>
        <NFormItem
            label="Пароль комнаты (если задан)"
            :show-feedback="false"
            tooltip="Общий пароль поездки. Нужен только если админ поставил защиту."
        >
          <NInput v-model:value="joinRoomPass" type="password" show-password-on="click" minlength="5"/>
        </NFormItem>
        <NButton type="primary" @click="doJoin">Войти</NButton>
        </div>
      </NForm>
    </NCard>
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

      </div>
    </header>

    <NTabs v-model:value="activeTab" type="line" animated>
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
            <NButton quaternary  title="Добавить вручную" @click="showManual = true">
              <template #icon>
                <NIcon>
                  <Add/>
                </NIcon>
              </template>
              Вручную
            </NButton>
            <NButton quaternary  title="QR / ФН" @click="showScan = true">
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
            <NCheckbox v-model:checked="hideSelected">Скрыть отмеченные мной</NCheckbox>
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
          <NCheckbox
              :checked="li.mySelected || li.forcedForAll"
              :disabled="!!state.trip.finishedAt || li.forcedForAll"
              @update:checked="() => toggleLine(li.id)"
          />
          <span class="prod-name">{{ li.name }}</span>
          <span class="prod-meta">{{ formatRub(li.priceKopecks) }}</span>
          <span v-if="li.selectedCount > 0" class="cnt">✓ {{ li.selectedCount }}</span>
          <NButton
              v-if="state.me?.isAdmin && !state.trip.finishedAt"
              size="tiny"
              quaternary
              @click="setForced(li.id, !li.forcedForAll)"
          >
            {{ li.forcedForAll ? 'разблок.' : 'всем' }}
          </NButton>
        </div>
      </NTabPane>
      <NTabPane name="p4" tab="Финал">
        <template v-if="!state.trip.finishedAt && state.me?.isAdmin">
          <NButton type="warning" @click="finishTrip">Поездка закончена</NButton>
        </template>
        <template v-else-if="state.trip.finishedAt">
          <NButton size="small" @click="loadSettlement">Обновить матрицу</NButton>
          <table v-if="settlement" class="matrix">
            <thead>
            <tr>
              <th></th>
              <th v-for="pid in settlement.participantIds" :key="pid">
                {{ settlement.names[pid] ?? pid }}
              </th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(rowId, i) in settlement.participantIds" :key="rowId">
              <th>{{ settlement.names[rowId] ?? rowId }}</th>
              <td v-for="(colId, j) in settlement.participantIds" :key="colId">
                {{ formatRub(settlement.kopecks[i]?.[j] ?? 0) }}
              </td>
            </tr>
            </tbody>
          </table>
          <p v-if="settlement && state.me" class="muted" style="margin-top: 1rem">
            Строка — кто должен; колонка — кому. Нули на диагонали.
          </p>
        </template>
        <p v-else class="muted">Закроет администратор.</p>
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
          <ul v-if="!state.trip.finishedAt" class="list">
            <li
                v-for="p in (state?.participants ?? []).filter((x) => x.id !== state?.me?.participantId)"
                :key="p.id"
            >
              {{ p.name }}
              <NButton size="small" quaternary type="error" @click="removeParticipant(p.id)">Удалить</NButton>
            </li>
          </ul>
          <NButton v-if="!state.trip.finishedAt" type="error" ghost @click="finishTrip">Завершить поездку</NButton>
        </div>
      </NTabPane>
    </NTabs>

    <NModal v-model:show="showScan" preset="card" title="Данные из QR чека">
      <NForm label-placement="top">
        <NSpace style="margin-bottom: 10px" wrap>
          <NButton secondary @click="startCameraScan" v-if="!scanning">Сканировать с камеры</NButton>
          <NButton secondary type="warning" @click="stopCameraScan" v-else>Остановить камеру</NButton>
          <NButton @click="triggerFilePick">Загрузить изображение</NButton>
          <input ref="qrFileInput" type="file" accept="image/*" @change="onFileChange" style="display:none"/>
        </NSpace>
        <div v-show="scanning" class="qr-preview">
          <video ref="qrVideo" class="qr-video" muted playsinline></video>
        </div>
        <NFormItem label="ФН">
          <NInput v-model:value="scan.fn"/>
        </NFormItem>
        <NFormItem label="ФД">
          <NInput v-model:value="scan.fd"/>
        </NFormItem>
        <NFormItem label="ФП">
          <NInput v-model:value="scan.fp"/>
        </NFormItem>
        <NFormItem label="Сумма (как в чеке)">
          <NInput v-model:value="scan.total" placeholder="1250.00"/>
        </NFormItem>
        <NFormItem label="Дата">
          <NInput v-model:value="scan.date" placeholder="2025-03-03"/>
        </NFormItem>
        <NFormItem label="Время">
          <NInput v-model:value="scan.time" placeholder="13:00"/>
        </NFormItem>
        <NButton type="primary" block @click="submitScan">Проверить и добавить</NButton>
      </NForm>
    </NModal>

    <NModal v-model:show="showManual" preset="card" title="Ручная позиция">
      <NForm label-placement="top">
        <NFormItem label="Название">
          <NInput v-model:value="manualName" placeholder="Бензин"/>
        </NFormItem>
        <NFormItem label="Цена, ₽">
          <NInput v-model:value="manualPrice" placeholder="500"/>
        </NFormItem>
        <NButton type="primary" block @click="submitManual">Добавить</NButton>
      </NForm>
    </NModal>

    <NModal
        v-model:show="showEditLine"
        preset="card"
        title="Редактирование позиции"
        @after-leave="closeEditLine"
    >
      <template v-if="selectedLineItem && canEditSelectedLine">
        <div class="muted small" style="margin-bottom: 8px">
          Чек: {{ selectedLineReceipt?.institution }} · плательщик: {{ selectedLineReceipt?.payerName }}
        </div>
        <NForm label-placement="top">
          <NFormItem label="Название">
            <NInput v-model:value="editLineName"/>
          </NFormItem>
          <NFormItem label="Цена, ₽">
            <NInput v-model:value="editLinePriceRub" placeholder="100.00"/>
          </NFormItem>
          <NSpace justify="space-between">
            <NButton type="error" ghost @click="deleteLine">Удалить</NButton>
            <NButton type="primary" @click="saveEditLine">Сохранить</NButton>
          </NSpace>
        </NForm>
      </template>
      <template v-else>
        <p class="muted">Нет прав на редактирование этой позиции.</p>
      </template>
    </NModal>

    <NModal
        v-model:show="roomQrCodeModal"
    >
      <NImage
          width="300"
          :src="qrcode"
      />
    </NModal>
  </div>
</template>

<style scoped>
.form-container{
  display: flex;
  flex-direction: column;
  gap: 1.5em;
}
.trip :deep(.n-tabs) {
  margin-top: 14px;
}

.trip :deep(.n-tabs .n-tabs-nav) {
  position: sticky;
  top: 10px;
  z-index: 10;
  backdrop-filter: blur(10px);
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
