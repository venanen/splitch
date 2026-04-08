import * as cheerio from 'cheerio';
import {ReceiptData, ReceiptPosition} from "../../types";



export class ReceiptParser {
    private $: cheerio.Root;

    constructor(html: string) {
        this.$ = cheerio.load(html);
    }

    private parseNumber(str: string): number {
        return parseFloat(str.replace(/,/g, ''));
    }

    private extractSectionText(startText: string): string[] {
        const sections: string[] = [];
        let currentSection: string[] = [];

        this.$('*').contents().each((_, el) => {
            const text = this.$(el).text().trim();
            if (text === '--------------------------------') {
                if (currentSection.length > 0) {
                    sections.push(currentSection.join('\n'));
                    currentSection = [];
                }
            } else if (text) {
                currentSection.push(text);
            }
        });

        return sections;
    }

    public parse(): ReceiptData {
        const sections = this.extractSectionText('--------------------------------');

        // Основная информация
        const institution = this.$('h3').first().text().trim();
        const address = this.$('br:contains("Адрес")').first().next().text().trim();
        const inn = this.$('br:contains("ИНН")').first().next().text().trim().split(' ')[1];

        // Дата и номер чека
        const dateSection = sections[1];
        const [datetime, receiptNumber, shiftNumber, cashier] = dateSection.split('\n');

        // Позиции чека
        const positions: ReceiptPosition[] = [];
        this.$('table tr').slice(1).each((_, row) => {
            const cols = this.$(row).find('td');
            positions.push({
                name: cols.eq(1).text().trim(),
                price: this.parseNumber(cols.eq(2).text().trim()),
                quantity: this.parseNumber(cols.eq(3).text().trim()),
                total: this.parseNumber(cols.eq(4).text().trim()),
            });
        });

        // Итоговая информация
        const totalSection = sections[3];
        const totalValues = totalSection.split('\n').map(line => {
            const match = line.match(/^(.*?):\s*(.+)$/);
            return match ? { key: match[1], value: this.parseNumber(match[2]) } : null;
        });

        // Реквизиты
        const detailsSection = sections[4];
        const details = Object.fromEntries(
            detailsSection.split('\n').map(line => {
                const [key, ...values] = line.split(': ');
                return [key.trim(), values.join(': ').trim()];
            })
        );

        return {
            institution,
            address,
            inn,
            datetime: datetime.trim(),
            receiptNumber: receiptNumber?.replace('Чек №', '').trim(),
            shiftNumber: shiftNumber?.replace('Смена №', '').trim(),
            cashier: cashier?.replace('Кассир:', '').trim(),
            positions,
            total: totalValues.find(v => v?.key === 'ИТОГО')?.value || 0,
            cash: totalValues.find(v => v?.key === 'Наличные')?.value || 0,
            card: totalValues.find(v => v?.key === 'Карта')?.value || 0,
            tax18: totalValues.find(v => v?.key === 'НДС 18%')?.value || 0,
            tax10: totalValues.find(v => v?.key === 'НДС 10%')?.value || 0,
            kktRegNumber: details['Рег. номер ККТ'] || '',
            fn: details['ФН'] || '',
            fd: details['ФД'] || '',
            fpd: details['ФПД#'] || '',
        };
    }
}

// Пример использования
const html = `<div style='width: 320px; margin: auto; text-align: center; font-family: monospace;'><h3>ФЕДЕРАЛЬНОЕ БЮДЖЕТНОЕ УЧРЕЖДЕНИЕ &quot;ЦЕНТРАЛЬНАЯ КЛИНИЧЕСКАЯ БОЛЬНИЦА ГРАЖДАНСКОЙ АВИАЦИИ&quot;</h3>Адрес не указан<br>ИНН 7733046721  <br>--------------------------------<br>2025-03-03T13:00:00<br>Чек № 2271<br>Смена № 42<br>Кассир: Конова Светлана Николаевна<br>--------------------------------<br><h4>ПРИХОД</h4><table style='width: 100%; border-collapse: collapse; text-align: left;'><tr><th>№</th><th>Название</th><th style='text-align: right;'>Цена</th><th style='text-align: right;'>Кол.</th><th style='text-align: right;'>Сумма</th></tr><tr><td>1</td><td>Прием (осмотр, консультация) врача-уролога повторный</td><td style='text-align: right;'>1,250.00</td><td style='text-align: right;'>2</td><td style='text-align: right;'>2,250.00</td></tr></table>--------------------------------<br><p>ИТОГО: 1,250.00</p><p>Наличные: 0.00</p><p>Карта: 1,250.00</p><p>НДС 18%: 0.00</p><p>НДС 10%: 0.00</p>--------------------------------<br><p>ВИД НАЛОГООБЛОЖЕНИЯ: 1</p><p>Рег. номер ККТ: 0000733387011528    </p><p>ФН: 7384440800215290</p><p>ФД: 2271</p><p>ФПД#: 1305261358</p>--------------------------------<br><h4>QR-код чека:</h4><img src='https://api.qrserver.com/v1/create-qr-code/?data=fn%3D7384440800215290%26fd%3D2271%26fp%3D1305261358%26t%3D2025-03-03T13%3A00%3A00%26s%3D125000' alt='QR код' style='width: 150px; height: 150px; margin: auto;'></div><div style='text-align: center; margin-top: 20px;'><button style='padding: 10px 20px; font-size: 16px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 20px;' onclick='history.back();'>Сканировать еще</button><div style='display: inline-block;'><form action='save_receipt.php' method='post' style='display: inline;'><input type='hidden' name='fiscal_drive_number' value='7384440800215290'><input type='hidden' name='fiscal_document_number' value='2271'><input type='hidden' name='fiscal_sign' value='1305261358'><input type='hidden' name='total_sum' value='125000'><input type='hidden' name='datetime' value='2025-03-03T13:00:00'><select name='format' required style='padding: 10px; font-size: 16px; margin-right: 20px;'><option value='pdf'>PDF</option><option value='json'>JSON</option><option value='xml'>XML</option><option value='excel'>Excel</option></select><input type='submit' value='Сохранить чек' style='padding: 10px 20px; font-size: 16px; background-color: #008CBA; color: white; border: none; border-radius: 5px; cursor: pointer;'></form></div></div></div>`; // Вставить предоставленный HTML
const parser = new ReceiptParser(html);
const result = parser.parse();
console.log(JSON.stringify(result, null, 2));
