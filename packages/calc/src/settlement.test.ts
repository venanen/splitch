import { describe, expect, it } from 'vitest';
import {
  computeDebtMatrix,
  splitKopecksFair,
  columnTotalReceived,
} from './settlement.js';

describe('splitKopecksFair', () => {
  it('делит без остатка поровну', () => {
    expect(splitKopecksFair(300_00, 3)).toEqual([100_00, 100_00, 100_00]);
  });

  it('распределяет остаток по первым', () => {
    expect(splitKopecksFair(100, 3)).toEqual([34, 33, 33]);
  });
});

describe('computeDebtMatrix', () => {
  it('шашлык 300 руб на троих отметивших — по 100 каждому к плательщику', () => {
    const a = 'a';
    const b = 'b';
    const c = 'c';
    const payer = 'p';
    const m = computeDebtMatrix({
      participants: [{ id: a }, { id: b }, { id: c }, { id: payer }],
      lineItems: [
        {
          id: '1',
          receiptId: 'r1',
          payerId: payer,
          priceKopecks: 300_00,
          selectedParticipantIds: [a, b, c],
          forcedForAll: false,
        },
      ],
      receiptAdjustments: [
        {
          receiptId: 'r1',
          payerId: payer,
          officialTotalKopecks: 300_00,
          sumOfLineItemsKopecks: 300_00,
        },
      ],
    });
    const pi = m.participantIds.indexOf(payer);
    expect(m.kopecks[m.participantIds.indexOf(a)]![pi]).toBe(100_00);
    expect(m.kopecks[m.participantIds.indexOf(b)]![pi]).toBe(100_00);
    expect(m.kopecks[m.participantIds.indexOf(c)]![pi]).toBe(100_00);
  });

  it('никто не отметил — делим на всех участников поездки', () => {
    const a = 'a';
    const b = 'b';
    const payer = 'p';
    const m = computeDebtMatrix({
      participants: [{ id: a }, { id: b }, { id: payer }],
      lineItems: [
        {
          id: '1',
          receiptId: 'r1',
          payerId: payer,
          priceKopecks: 300_00,
          selectedParticipantIds: [],
          forcedForAll: false,
        },
      ],
      receiptAdjustments: [
        {
          receiptId: 'r1',
          payerId: payer,
          officialTotalKopecks: 300_00,
          sumOfLineItemsKopecks: 300_00,
        },
      ],
    });
    const pi = m.participantIds.indexOf(payer);
    expect(m.kopecks[m.participantIds.indexOf(a)]![pi]).toBe(100_00);
    expect(m.kopecks[m.participantIds.indexOf(b)]![pi]).toBe(100_00);
  });

  it('подстройка: official больше суммы позиций — доплата всеми плательщику', () => {
    const a = 'a';
    const payer = 'p';
    const m = computeDebtMatrix({
      participants: [{ id: a }, { id: payer }],
      lineItems: [
        {
          id: '1',
          receiptId: 'r1',
          payerId: payer,
          priceKopecks: 100_00,
          selectedParticipantIds: [a],
          forcedForAll: false,
        },
      ],
      receiptAdjustments: [
        {
          receiptId: 'r1',
          payerId: payer,
          officialTotalKopecks: 120_00,
          sumOfLineItemsKopecks: 100_00,
        },
      ],
    });
    const pi = m.participantIds.indexOf(payer);
    expect(m.kopecks[m.participantIds.indexOf(a)]![pi]).toBe(120_00);
  });
});

describe('columnTotalReceived', () => {
  it('суммирует входящие по колонке плательщика', () => {
    const a = 'a';
    const b = 'b';
    const payer = 'p';
    const m = computeDebtMatrix({
      participants: [{ id: a }, { id: b }, { id: payer }],
      lineItems: [
        {
          id: '1',
          receiptId: 'r1',
          payerId: payer,
          priceKopecks: 300_00,
          selectedParticipantIds: [a, b],
          forcedForAll: false,
        },
      ],
      receiptAdjustments: [],
    });
    expect(columnTotalReceived(m, payer)).toBe(300_00);
  });
});
