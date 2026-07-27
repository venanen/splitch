import { describe, expect, it } from 'vitest';
import { expandPositionsFromReceipt, rubToKopecks } from './expand-positions.js';

describe('rubToKopecks', () => {
  it('округляет до копеек', () => {
    expect(rubToKopecks(100)).toBe(100_00);
    expect(rubToKopecks(10.005)).toBe(1001);
  });
});

describe('expandPositionsFromReceipt', () => {
  it('qty=1 — одна строка с полной суммой', () => {
    expect(
      expandPositionsFromReceipt({
        name: 'Хлеб',
        price: 50,
        quantity: 1,
        total: 50,
      }),
    ).toEqual([{ name: 'Хлеб', priceKopecks: 50_00 }]);
  });

  it('qty=3, total 300 — три единицы по 100 руб', () => {
    expect(
      expandPositionsFromReceipt({
        name: 'Шашлык',
        price: 100,
        quantity: 3,
        total: 300,
      }),
    ).toEqual([
      { name: 'Шашлык', priceKopecks: 100_00 },
      { name: 'Шашлык', priceKopecks: 100_00 },
      { name: 'Шашлык', priceKopecks: 100_00 },
    ]);
  });

  it('распределяет остаток копеек по первым единицам', () => {
    const rows = expandPositionsFromReceipt({
      name: 'Сок',
      price: 33.33,
      quantity: 3,
      total: 100,
    });
    expect(rows).toHaveLength(3);
    expect(rows.reduce((s, r) => s + r.priceKopecks, 0)).toBe(100_00);
    expect(rows.map((r) => r.priceKopecks)).toEqual([3334, 3333, 3333]);
  });

  it('qty < 1 трактует как 1', () => {
    expect(
      expandPositionsFromReceipt({
        name: 'X',
        price: 10,
        quantity: 0.5,
        total: 10,
      }),
    ).toEqual([{ name: 'X', priceKopecks: 10_00 }]);
  });
});
