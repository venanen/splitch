import { describe, expect, it } from 'vitest';
import { ReceiptParser } from './receipt-parser.js';

/** Укороченный HTML из примера (структура как у сервиса проверки). */
const sampleHtml = `<div><h3>ТЕСТ МАГАЗИН</h3>Адрес не указан<br>ИНН 7733046721  <br>--------------------------------<br>2025-03-03T13:00:00<br>Чек № 2271<br>Смена № 42<br>Кассир: Иванов<br>--------------------------------<br><h4>ПРИХОД</h4><table><tr><th>№</th><th>Название</th><th>Цена</th><th>Кол.</th><th>Сумма</th></tr><tr><td>1</td><td>Шашлык</td><td>100.00</td><td>3</td><td>300.00</td></tr></table>--------------------------------<br><p>ИТОГО: 300.00</p><p>Наличные: 0.00</p><p>Карта: 300.00</p><p>НДС 18%: 0.00</p><p>НДС 10%: 0.00</p>--------------------------------<br><p>ВИД НАЛОГООБЛОЖЕНИЯ: 1</p><p>Рег. номер ККТ: 0000733387011528    </p><p>ФН: 7384440800215290</p><p>ФД: 2271</p><p>ФПД#: 1305261358</p>--------------------------------<br></div>`;

const multiPosHtml = `<div><h3>АШАН</h3>Адрес<br>ИНН 123 <br>--------------------------------<br>2025-01-01T10:00:00<br>Чек № 1<br>Смена № 1<br>Кассир: X<br>--------------------------------<br><h4>ПРИХОД</h4><table><tr><th>№</th><th>Название</th><th>Цена</th><th>Кол.</th><th>Сумма</th></tr><tr><td>1</td><td>Хлеб</td><td>50.00</td><td>1</td><td>50.00</td></tr><tr><td>2</td><td>Молоко</td><td>80.00</td><td>2</td><td>160.00</td></tr></table>--------------------------------<br><p>ИТОГО: 210.00</p><p>Наличные: 0.00</p><p>Карта: 210.00</p><p>НДС 18%: 0.00</p><p>НДС 10%: 0.00</p>--------------------------------<br><p>ВИД НАЛОГООБЛОЖЕНИЯ: 1</p><p>Рег. номер ККТ: 1</p><p>ФН: 111</p><p>ФД: 2</p><p>ФПД#: 3</p>--------------------------------<br></div>`;

describe('ReceiptParser', () => {
  it('извлекает позиции и итог', () => {
    const r = new ReceiptParser(sampleHtml).parse();
    expect(r.positions.length).toBe(1);
    expect(r.positions[0]?.name).toContain('Шашлык');
    expect(r.total).toBe(300);
    expect(r.fn).toBe('7384440800215290');
  });

  it('извлекает несколько позиций', () => {
    const r = new ReceiptParser(multiPosHtml).parse();
    expect(r.positions).toHaveLength(2);
    expect(r.positions[0]?.name).toBe('Хлеб');
    expect(r.positions[1]?.name).toBe('Молоко');
    expect(r.positions[1]?.quantity).toBe(2);
    expect(r.total).toBe(210);
    expect(r.institution).toBe('АШАН');
  });

  it('битый HTML без таблицы — пустые позиции, без падения', () => {
    const r = new ReceiptParser('<div><h3>Пусто</h3></div>').parse();
    expect(r.positions).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.institution).toBe('Пусто');
  });
});
