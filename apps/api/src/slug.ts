const ALPH = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Короткий slug для URL комнаты. */
export function randomSlug(): string {
  let s = '';
  for (let i = 0; i < 12; i++) {
    s += ALPH[Math.floor(Math.random() * ALPH.length)]!;
  }
  return s;
}
