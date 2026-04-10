import {
  computeDebtMatrix,
  type SettlementInput,
} from '../../../../packages/calc/src/settlement.js';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  itemSelections,
  lineItems,
  participants,
  receipts,
} from '../db/schema.js';

/** Собирает вход для расчёта из текущего состояния БД поездки. */
export async function buildSettlementInput(tripId: string): Promise<SettlementInput> {
  const plist = await db
    .select()
    .from(participants)
    .where(eq(participants.tripId, tripId));
  const participantRefs = plist.map((p) => ({ id: p.id }));

  const rlist = await db.select().from(receipts).where(eq(receipts.tripId, tripId));

  const lines = await db.select().from(lineItems).where(eq(lineItems.tripId, tripId));

  const lineIds = lines.map((l) => l.id);
  const selections =
    lineIds.length === 0
      ? []
      : await db
          .select()
          .from(itemSelections)
          .where(inArray(itemSelections.lineItemId, lineIds));

  const selByLine = new Map<string, string[]>();
  for (const s of selections) {
    const arr = selByLine.get(s.lineItemId) ?? [];
    arr.push(s.participantId);
    selByLine.set(s.lineItemId, arr);
  }

  const receiptById = new Map(rlist.map((r) => [r.id, r] as const));

  const settlementLines = lines.map((li) => {
    const rec = receiptById.get(li.receiptId);
    return {
      id: li.id,
      receiptId: li.receiptId,
      payerId: rec?.payerId ?? '',
      priceKopecks: li.priceKopecks,
      selectedParticipantIds: li.forcedForAll ? [] : (selByLine.get(li.id) ?? []),
      forcedForAll: li.forcedForAll,
    };
  });

  const receiptAdjustments = rlist.map((r) => {
    const sumLines = lines
      .filter((l) => l.receiptId === r.id)
      .reduce((s, l) => s + l.priceKopecks, 0);
    return {
      receiptId: r.id,
      payerId: r.payerId,
      officialTotalKopecks: r.officialTotalKopecks,
      sumOfLineItemsKopecks: sumLines,
    };
  });

  return {
    participants: participantRefs,
    lineItems: settlementLines,
    receiptAdjustments,
  };
}

export async function computeMatrixForTrip(tripId: string) {
  const input = await buildSettlementInput(tripId);
  return computeDebtMatrix(input);
}
