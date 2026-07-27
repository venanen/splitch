import { describe, expect, it } from 'vitest';
import {
  computeDebtMatrix,
  splitKopecksFair,
  columnTotalReceived,
  matrixRowOwesToPayers,
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

  it('forcedForAll — делит на всех участников, игнорируя selections', () => {
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
          selectedParticipantIds: [a],
          forcedForAll: true,
        },
      ],
      receiptAdjustments: [],
    });
    const pi = m.participantIds.indexOf(payer);
    // pool = [a,b,p], payer не должен сам себе → a и b по 100
    expect(m.kopecks[m.participantIds.indexOf(a)]![pi]).toBe(100_00);
    expect(m.kopecks[m.participantIds.indexOf(b)]![pi]).toBe(100_00);
  });

  it('подстройка: official меньше суммы позиций — уменьшает долг (sign −1)', () => {
    const a = 'a';
    const payer = 'p';
    const m = computeDebtMatrix({
      participants: [{ id: a }, { id: payer }],
      lineItems: [
        {
          id: '1',
          receiptId: 'r1',
          payerId: payer,
          priceKopecks: 120_00,
          selectedParticipantIds: [a],
          forcedForAll: false,
        },
      ],
      receiptAdjustments: [
        {
          receiptId: 'r1',
          payerId: payer,
          officialTotalKopecks: 100_00,
          sumOfLineItemsKopecks: 120_00,
        },
      ],
    });
    const pi = m.participantIds.indexOf(payer);
    // 120 − 20 = 100
    expect(m.kopecks[m.participantIds.indexOf(a)]![pi]).toBe(100_00);
  });

  it('неттинг: взаимные долги A↔B сворачиваются в одну сторону', () => {
    const a = 'a';
    const b = 'b';
    const m = computeDebtMatrix({
      participants: [{ id: a }, { id: b }],
      lineItems: [
        {
          id: '1',
          receiptId: 'r1',
          payerId: b,
          priceKopecks: 100_00,
          selectedParticipantIds: [a],
          forcedForAll: false,
        },
        {
          id: '2',
          receiptId: 'r2',
          payerId: a,
          priceKopecks: 40_00,
          selectedParticipantIds: [b],
          forcedForAll: false,
        },
      ],
      receiptAdjustments: [],
    });
    const ia = m.participantIds.indexOf(a);
    const ib = m.participantIds.indexOf(b);
    expect(m.kopecks[ia]![ib]).toBe(60_00);
    expect(m.kopecks[ib]![ia]).toBe(0);
  });

  it('плательщик в пуле отметивших не создаёт долг самому себе', () => {
    const a = 'a';
    const payer = 'p';
    const m = computeDebtMatrix({
      participants: [{ id: a }, { id: payer }],
      lineItems: [
        {
          id: '1',
          receiptId: 'r1',
          payerId: payer,
          priceKopecks: 200_00,
          selectedParticipantIds: [a, payer],
          forcedForAll: false,
        },
      ],
      receiptAdjustments: [],
    });
    const pi = m.participantIds.indexOf(payer);
    const ai = m.participantIds.indexOf(a);
    expect(m.kopecks[ai]![pi]).toBe(100_00);
    expect(m.kopecks[pi]![pi]).toBe(0);
  });

  it('один участник в поездке — подстройка пропускается', () => {
    const payer = 'p';
    const m = computeDebtMatrix({
      participants: [{ id: payer }],
      lineItems: [
        {
          id: '1',
          receiptId: 'r1',
          payerId: payer,
          priceKopecks: 100_00,
          selectedParticipantIds: [],
          forcedForAll: false,
        },
      ],
      receiptAdjustments: [
        {
          receiptId: 'r1',
          payerId: payer,
          officialTotalKopecks: 150_00,
          sumOfLineItemsKopecks: 100_00,
        },
      ],
    });
    expect(m.kopecks[0]![0]).toBe(0);
  });

  it('несколько чеков и плательщиков — колонки независимы', () => {
    const a = 'a';
    const b = 'b';
    const m = computeDebtMatrix({
      participants: [{ id: a }, { id: b }],
      lineItems: [
        {
          id: '1',
          receiptId: 'r1',
          payerId: a,
          priceKopecks: 100_00,
          selectedParticipantIds: [b],
          forcedForAll: false,
        },
        {
          id: '2',
          receiptId: 'r2',
          payerId: b,
          priceKopecks: 50_00,
          selectedParticipantIds: [a],
          forcedForAll: false,
        },
      ],
      receiptAdjustments: [],
    });
    const ia = m.participantIds.indexOf(a);
    const ib = m.participantIds.indexOf(b);
    // после неттинга: b должен a 100, a должен b 50 → a должен b 0, b должен a 50
    expect(m.kopecks[ib]![ia]).toBe(50_00);
    expect(m.kopecks[ia]![ib]).toBe(0);
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

describe('matrixRowOwesToPayers', () => {
  it('возвращает ненулевые долги строки без самодолга', () => {
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
          priceKopecks: 200_00,
          selectedParticipantIds: [a, b],
          forcedForAll: false,
        },
      ],
      receiptAdjustments: [],
    });
    expect(matrixRowOwesToPayers(m, a)).toEqual([
      { payerId: payer, kopecks: 100_00 },
    ]);
    expect(matrixRowOwesToPayers(m, payer)).toEqual([]);
  });
});
