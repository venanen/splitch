/** Нормализация телефона РФ: только цифры, 10 последних, с префиксом 7 при необходимости. */
export function normalizePhoneRu(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith('7')) {
    return digits;
  }
  if (digits.length === 10) {
    return `7${digits}`;
  }
  return digits;
}
