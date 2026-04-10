FROM oven/bun:1.3.11 AS base
WORKDIR /app

# Устанавливаем зависимости (монорепо).
# Важно: у API зависимости на локальные пакеты через file:../../packages/*,
# поэтому каталоги packages должны существовать ДО bun install.
COPY package.json package-lock.json* ./
COPY packages/types packages/types
COPY packages/calc packages/calc
COPY apps/api/package.json apps/api/package.json

# В bun-образе может не быть npm; используем bun install.
RUN bun install

# Код API
COPY apps/api apps/api

WORKDIR /app/apps/api

# drizzle-kit использует DATABASE_URL во время push; зададим в compose.
EXPOSE 3000

# Перед стартом поднимаем схему в БД.
CMD ["sh", "-c", "bun run db:push && bun run start"]
