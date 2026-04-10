/**
 * Расчёт долгов между участниками поездки по позициям чеков.
 * Суммы в копейках (целые), чтобы избежать ошибок float.
 */

export type ParticipantRef = { id: string };

/** Одна строка позиции для расчёта (уже нормализованная до количества 1 при необходимости на уровне БД). */
export type SettlementLineItem = {
  id: string;
  /** Идентификатор чека (для подстройки суммы по officialTotal) */
  receiptId: string;
  /** Кто оплатил чек (получатель долга по этой позиции) */
  payerId: string;
  /** Цена позиции в копейках */
  priceKopecks: number;
  /** Кто отметил участие (если forcedForAll — игнорируется, берутся все участники поездки) */
  selectedParticipantIds: string[];
  /** Админ принудительно отметил у всех */
  forcedForAll: boolean;
};

export type ReceiptTotal = {
  receiptId: string;
  /** Плательщик по чеку (получатель подстройки) */
  payerId: string;
  /** Итог по чеку в копейках (авторитетное значение с ФНС/парсера) */
  officialTotalKopecks: number;
  /** Сумма позиций в БД (может отличаться от official из-за округлений парсера) */
  sumOfLineItemsKopecks: number;
};

export type SettlementInput = {
  participants: ParticipantRef[];
  lineItems: SettlementLineItem[];
  /** Подстройка по каждому чеку: разница official − sum(lines) делится поровну на всех участников поездки в пользу плательщика */
  receiptAdjustments: ReceiptTotal[];
};

/** Матрица: сколько участник rowId должен участнику colId (колонка = плательщик). */
export type DebtMatrix = {
  participantIds: string[];
  /** kopecks[i][j] = i должен j */
  kopecks: number[][];
};

/**
 * Справедливо делит total копеек на parts частей (сумма частей = total).
 * Остаток распределяется по одной копейке первым участникам (детерминированно).
 */
export function splitKopecksFair(total: number, parts: number): number[] {
  if (parts <= 0) throw new Error('parts должен быть > 0');
  if (total < 0) throw new Error('total не может быть отрицательным');
  const base = Math.floor(total / parts);
  const rem = total % parts;
  const out: number[] = [];
  for (let i = 0; i < parts; i++) {
    out.push(base + (i < rem ? 1 : 0));
  }
  return out;
}

/**
 * Для одной позиции: кто сколько должен плательщику.
 * - Если есть отметившие (или forced): делим price на их число.
 * - Если никто не отметил: делим на всех участников поездки.
 */
function allocateLineItem(
  item: SettlementLineItem,
  allIds: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  let pool: string[];

  if (item.forcedForAll) {
    pool = [...allIds];
  } else if (item.selectedParticipantIds.length > 0) {
    pool = [...new Set(item.selectedParticipantIds)].filter((id) =>
      allIds.includes(id),
    );
  } else {
    pool = [...allIds];
  }

  if (pool.length === 0) {
    return out;
  }

  const shares = splitKopecksFair(item.priceKopecks, pool.length);
  pool.sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < pool.length; i++) {
    const id = pool[i];
    if (!id) continue;
    out.set(id, (out.get(id) ?? 0) + (shares[i] ?? 0));
  }
  return out;
}

function emptyMatrix(ids: string[]): number[][] {
  const n = ids.length;
  return Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
}

/**
 * Строит матрицу долгов и возвращает её.
 * debt[i][j] — сколько ids[i] должен ids[j] в копейках.
 */
export function computeDebtMatrix(input: SettlementInput): DebtMatrix {
  const ids = input.participants.map((p) => p.id).sort((a, b) => a.localeCompare(b));
  const idIndex = new Map(ids.map((id, i) => [id, i] as const));

  const matrix = emptyMatrix(ids);

  const addDebt = (from: string, to: string, kopecks: number) => {
    if (kopecks === 0) return;
    const i = idIndex.get(from);
    const j = idIndex.get(to);
    if (i === undefined || j === undefined || from === to) return;
    matrix[i]![j]! += kopecks;
  };

  for (const item of input.lineItems) {
    const perPerson = allocateLineItem(item, ids);
    for (const [participantId, amount] of perPerson) {
      addDebt(participantId, item.payerId, amount);
    }
  }

  // Подстройка по чекам: (official − sum позиций) на всех участников в пользу плательщика чека
  const itemsByReceipt = new Map<string, SettlementLineItem[]>();
  for (const it of input.lineItems) {
    const list = itemsByReceipt.get(it.receiptId) ?? [];
    list.push(it);
    itemsByReceipt.set(it.receiptId, list);
  }

  for (const adj of input.receiptAdjustments) {
    const diff =
      adj.officialTotalKopecks - adj.sumOfLineItemsKopecks;
    if (diff === 0) continue;
    const payerId = adj.payerId;
    // Долю плательщика нельзя учесть как долг самому себе — делим только между остальными
    const others = ids.filter((id) => id !== payerId);
    if (others.length === 0) continue;
    const parts = splitKopecksFair(Math.abs(diff), others.length);
    const sign = diff > 0 ? 1 : -1;
    for (let i = 0; i < others.length; i++) {
      const pid = others[i];
      if (!pid) continue;
      addDebt(pid, payerId, sign * (parts[i] ?? 0));
    }
  }

  return { participantIds: ids, kopecks: matrix };
}

/**
 * Упрощённая строка для UI: сколько participantId должен каждому плательщику (нетт по колонкам).
 */
export function matrixRowOwesToPayers(
  matrix: DebtMatrix,
  participantId: string,
): { payerId: string; kopecks: number }[] {
  const i = matrix.participantIds.indexOf(participantId);
  if (i < 0) return [];
  const row = matrix.kopecks[i] ?? [];
  return matrix.participantIds
    .map((payerId, j) => ({ payerId, kopecks: row[j] ?? 0 }))
    .filter((x) => x.kopecks !== 0 && x.payerId !== participantId);
}

/** «Сколько съел денег» — суммарно получено этим участником как плательщику от остальных (по колонке). */
export function columnTotalReceived(matrix: DebtMatrix, payerId: string): number {
  const j = matrix.participantIds.indexOf(payerId);
  if (j < 0) return 0;
  let s = 0;
  for (let i = 0; i < matrix.participantIds.length; i++) {
    if (i === j) continue;
    s += matrix.kopecks[i]?.[j] ?? 0;
  }
  return s;
}
