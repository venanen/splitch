import * as cheerio from 'cheerio';
import type {
  ReceiptData,
  ReceiptPosition,
} from '../../../../packages/types/src/index.js';

/** Парсинг HTML-страницы чека (как возвращает сервис проверки). */
export class ReceiptParser {
  private $: cheerio.CheerioAPI;

  constructor(html: string) {
    this.$ = cheerio.load(html);
  }

  private parseNumber(str: string): number {
    return parseFloat(str.replace(/,/g, ''));
  }

  private extractSectionText(): string[] {
    const sections: string[] = [];
    let currentSection: string[] = [];

    this.$('*')
      .contents()
      .each((_, el) => {
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
    const sections = this.extractSectionText();

    const institution = this.$('h3').first().text().trim();
    const address = this.$('br:contains("Адрес")').first().next().text().trim();
    const inn = this.$('br:contains("ИНН")').first().next().text().trim().split(' ')[1] ?? '';

    const dateSection = sections[1] ?? '';
    const [datetime, receiptNumber, shiftNumber, cashier] = dateSection.split('\n');

    const positions: ReceiptPosition[] = [];
    this.$('table tr')
      .slice(1)
      .each((_, row) => {
        const cols = this.$(row).find('td');
        if (cols.length < 5) return;
        positions.push({
          name: cols.eq(1).text().trim(),
          price: this.parseNumber(cols.eq(2).text().trim()),
          quantity: this.parseNumber(cols.eq(3).text().trim()),
          total: this.parseNumber(cols.eq(4).text().trim()),
        });
      });

    const totalSection = sections[3] ?? '';
    const totalValues = totalSection.split('\n').map((line) => {
      const match = line.match(/^(.*?):\s*(.+)$/);
      return match ? { key: match[1], value: this.parseNumber(match[2] ?? '0') } : null;
    });

    const detailsSection = sections[4] ?? '';
    const details = Object.fromEntries(
      detailsSection.split('\n').map((line) => {
        const [key, ...values] = line.split(': ');
        return [key.trim(), values.join(': ').trim()];
      }),
    );

    return {
      institution,
      address,
      inn,
      datetime: datetime?.trim() ?? '',
      receiptNumber: receiptNumber?.replace('Чек №', '').trim() ?? '',
      shiftNumber: shiftNumber?.replace('Смена №', '').trim() ?? '',
      cashier: cashier?.replace('Кассир:', '').trim() ?? '',
      positions,
      total: totalValues.find((v) => v?.key === 'ИТОГО')?.value ?? 0,
      cash: totalValues.find((v) => v?.key === 'Наличные')?.value ?? 0,
      card: totalValues.find((v) => v?.key === 'Карта')?.value ?? 0,
      tax18: totalValues.find((v) => v?.key === 'НДС 18%')?.value ?? 0,
      tax10: totalValues.find((v) => v?.key === 'НДС 10%')?.value ?? 0,
      kktRegNumber: details['Рег. номер ККТ'] || '',
      fn: details['ФН'] || '',
      fd: details['ФД'] || '',
      fpd: details['ФПД#'] || '',
    };
  }
}
