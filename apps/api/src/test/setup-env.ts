/**
 * Env для тестов ДО импорта db/client.
 * По умолчанию — локальный Postgres из docker-compose (не remote из .env).
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://splitch:splitch@127.0.0.1:5432/splitch';

/**
 * Vitest крутится на Node: полифилл Bun.password для hash/verify в роутах.
 * Формат совместим только сам с собой (не bcrypt Bun) — этого хватает тестам.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

type BunPassword = {
  hash: (password: string) => Promise<string>;
  verify: (password: string, hash: string) => Promise<boolean>;
};

const g = globalThis as typeof globalThis & { Bun?: { password: BunPassword } };

if (!g.Bun?.password) {
  g.Bun = {
    password: {
      async hash(password: string) {
        const salt = randomBytes(16).toString('hex');
        const digest = createHash('sha256')
          .update(`${salt}:${password}`)
          .digest('hex');
        return `vitest$${salt}$${digest}`;
      },
      async verify(password: string, hash: string) {
        const parts = hash.split('$');
        if (parts[0] !== 'vitest' || parts.length < 3) return false;
        const salt = parts[1]!;
        const expected = parts[2]!;
        const digest = createHash('sha256')
          .update(`${salt}:${password}`)
          .digest('hex');
        try {
          return timingSafeEqual(
            Buffer.from(digest, 'hex'),
            Buffer.from(expected, 'hex'),
          );
        } catch {
          return false;
        }
      },
    },
  };
}
