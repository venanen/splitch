import { describe, expect, it } from 'vitest';
import { normalizePhoneRu } from './phone.js';

describe('normalizePhoneRu', () => {
  it('заменяет ведущую 8 на 7', () => {
    expect(normalizePhoneRu('8 (999) 123-45-67')).toBe('79991234567');
  });

  it('оставляет уже нормальный 7…', () => {
    expect(normalizePhoneRu('+7 999 123 45 67')).toBe('79991234567');
  });

  it('добавляет 7 к 10 цифрам', () => {
    expect(normalizePhoneRu('9991234567')).toBe('79991234567');
  });

  it('для мусора возвращает только цифры as-is', () => {
    expect(normalizePhoneRu('123')).toBe('123');
    expect(normalizePhoneRu('abc')).toBe('');
  });
});
