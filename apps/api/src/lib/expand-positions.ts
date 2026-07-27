/** Рубли → копейки. */
export function rubToKopecks(r: number): number {
  return Math.round(r * 100);
}

/**
 * Разбивает позицию чека на единицы: по строке на каждую единицу количества.
 * Остаток копеек распределяется по первым единицам.
 */
export function expandPositionsFromReceipt(pos: {
  name: string;
  price: number;
  quantity: number;
  total: number;
}): { name: string; priceKopecks: number }[] {
  const n = Math.max(1, Math.floor(pos.quantity));
  const totalK = rubToKopecks(pos.total);
  const perUnit = Math.floor(totalK / n);
  const rem = totalK - perUnit * n;
  const out: { name: string; priceKopecks: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      name: pos.name,
      priceKopecks: perUnit + (i < rem ? 1 : 0),
    });
  }
  return out;
}
