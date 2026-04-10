import { describe, expect, it } from 'vitest';
import { ReceiptParser } from './receipt-parser.js';

/** Укороченный HTML из примера (структура как у сервиса проверки). */
const sampleHtml = `<div><h3>ТЕСТ МАГАЗИН</h3>Адрес не указан<br>ИНН 7733046721  <br>--------------------------------<br>2025-03-03T13:00:00<br>Чек № 2271<br>Смена № 42<br>Кассир: Иванов<br>--------------------------------<br><h4>ПРИХОД</h4><table><tr><th>№</th><th>Название</th><th>Цена</th><th>Кол.</th><th>Сумма</th></tr><tr><td>1</td><td>Шашлык</td><td>100.00</td><td>3</td><td>300.00</td></tr></table>--------------------------------<br><p>ИТОГО: 300.00</p><p>Наличные: 0.00</p><p>Карта: 300.00</p><p>НДС 18%: 0.00</p><p>НДС 10%: 0.00</p>--------------------------------<br><p>ВИД НАЛОГООБЛОЖЕНИЯ: 1</p><p>Рег. номер ККТ: 0000733387011528    </p><p>ФН: 7384440800215290</p><p>ФД: 2271</p><p>ФПД#: 1305261358</p>--------------------------------<br></div>`;

describe('ReceiptParser', () => {
  it('извлекает позиции и итог', () => {
    const r = new ReceiptParser(sampleHtml).parse();
    expect(r.positions.length).toBe(1);
    expect(r.positions[0]?.name).toContain('Шашлык');
    expect(r.total).toBe(300);
    expect(r.fn).toBe('7384440800215290');
  });
});
