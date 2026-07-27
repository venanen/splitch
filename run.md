# Локальный запуск и отладка splitch

Не обязательно поднимать весь стек через `docker compose up`. Ниже — как гонять **Postgres**, **API** и **Web** по отдельности.

## Пререквизиты

- Node.js 20+
- [Bun](https://bun.sh) (API runtime)
- Docker (только для Postgres, опционально)
- `npm install` в корне репозитория

Скопируйте переменные окружения:

```bash
cp .env.example .env
```

## 1. Только Postgres

```bash
docker compose up postgres -d
npm run db:push
```

По умолчанию: `postgresql://splitch:splitch@127.0.0.1:5432/splitch` (порт `5432`).

Проверка: `docker compose ps` — сервис `postgres` healthy.

## 2. Только API (без Web и без Docker-образа API)

В `.env` должны быть как минимум `DATABASE_URL`, `PORT`, `CORS_ORIGIN`.

```bash
# из корня
npm run dev -w @splitch/api
```

Эквивалент:

```bash
cd apps/api
bun --env-file=../../.env --watch src/index.ts
```

- HTTP: `http://localhost:3000`
- Health: `GET http://localhost:3000/health` → `{ "ok": true }`
- REST: префикс `/api/...`
- WebSocket: `ws://localhost:3000/ws?token=...&tripId=...`

Для CORS при локальном Vite укажите:

```env
CORS_ORIGIN=http://localhost:5173
```

### Отладка API

**VS Code / Cursor** — launch-конфиг (пример):

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug API (Bun)",
  "runtimeExecutable": "bun",
  "runtimeArgs": ["--inspect", "--env-file=../../.env", "--watch", "src/index.ts"],
  "cwd": "${workspaceFolder}/apps/api",
  "console": "integratedTerminal"
}
```

Либо вручную:

```bash
cd apps/api
bun --inspect --env-file=../../.env --watch src/index.ts
```

и подключите debugger к порту inspect.

Логи пишутся в stdout. Внешний сервис чеков: `CHECK_VERIFY_URL` (можно не трогать в UI-разработке — используйте «Вручную»).

## 3. Только Web (без локального API)

```bash
npm run dev -w @splitch/web
```

Vite: `http://localhost:5173`.

Прокси (см. `apps/web/vite.config.ts`):

| Путь  | Куда                        | Переменная        |
|-------|-----------------------------|-------------------|
| `/api`| HTTP API                    | `VITE_API_PROXY`  |
| `/ws` | WebSocket API               | тот же host       |

По умолчанию прокси бьёт в `http://localhost:3000`.

### Web → уже запущенный API на другой машине / в Docker

Docker API из compose слушает **host `3001`** (`3001:3000`):

```env
# в apps/web/.env.local или корневом .env (Vite loadEnv из cwd web)
VITE_API_PROXY=http://localhost:3001
```

Либо абсолютный URL без прокси (запросы с браузера напрямую):

```env
VITE_API_URL=http://localhost:3001
```

При `VITE_API_URL` не забудьте CORS на API (`CORS_ORIGIN=http://localhost:5173`).

### Отладка Web

- DevTools браузера (Vue / Network)
- Vue breakpoints: обычный Chrome DevTools → Sources → Vite-модули
- Cursor/VS Code: «JavaScript Debug Terminal» + `npm run dev -w @splitch/web`

## Типичные DX-сценарии

| Цель                         | Что поднять                                      |
|-----------------------------|---------------------------------------------------|
| Верстка / UI без бэка       | только web + моки в e2e, либо stub API            |
| API + схема БД              | postgres + api                                    |
| Полный локальный happy-path | postgres + api + web (`npm run dev` в корне)      |
| Как на сервере              | `docker compose up --build` → web `:8080`, api `:3001` |

Полный dev одной командой (api + web, Postgres уже должен быть доступен по `DATABASE_URL`):

```bash
npm run dev
```

## Тесты

```bash
# unit calc + unit api helpers + integration API (нужен локальный Postgres)
npm test

# только calc
npm run test -w @splitch/calc

# api: vitest unit, затем bun integration
npm run test -w @splitch/api
npm run test:integration -w @splitch/api

# e2e (только Vite, API мокается в Playwright — Postgres/API не нужны)
npm run test:e2e
```

Integration API по умолчанию использует **локальный** Postgres `127.0.0.1:5432`, а не remote из `.env` (см. `apps/api/src/test/setup-env.ts`). Переопределение:

```bash
# Windows PowerShell
$env:TEST_DATABASE_URL="postgresql://splitch:splitch@127.0.0.1:5432/splitch"
npm run test:integration -w @splitch/api
```

## Переменные окружения

| Переменная         | Где   | Назначение                                      |
|--------------------|-------|-------------------------------------------------|
| `DATABASE_URL`     | API   | Postgres                                        |
| `PORT`             | API   | Порт HTTP/WS (по умолчанию 3000)                |
| `CORS_ORIGIN`      | API   | Origin фронта (через запятую)                   |
| `CHECK_VERIFY_URL` | API   | Внешний сервис проверки чека                    |
| `VITE_API_PROXY`   | Web   | Куда Vite проксирует `/api` и `/ws`             |
| `VITE_API_URL`     | Web   | Абсолютный base URL API (если не через proxy)   |
| `TEST_DATABASE_URL`| tests | БД для integration (иначе localhost compose)    |
