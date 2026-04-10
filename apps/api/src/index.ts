import { cors } from '@elysiajs/cors';
import { cookie as elysiaCookie } from '@elysiajs/cookie';
import { Elysia } from 'elysia';
import { getParticipantByToken } from './auth.js';
import { apiRoutes } from './routes/api.js';
import { subscribeTrip } from './realtime.js';

const port = Number(process.env.PORT ?? 3000);

const app = new Elysia()
  .use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(',') ?? true,
      credentials: true,
    }),
  )
  .use(elysiaCookie())
  .get('/health', () => ({ ok: true }))
  .use(apiRoutes);

type WsData = {
  tripId: string;
  token: string;
  unsub?: () => void;
};

const server = Bun.serve<WsData>({
  port,
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const token = url.searchParams.get('token') ?? '';
      const tripId = url.searchParams.get('tripId') ?? '';
      if (!token || !tripId) {
        return new Response('token и tripId обязательны', { status: 400 });
      }
      const upgraded = srv.upgrade(req, { data: { token, tripId } });
      if (upgraded) return undefined;
      return new Response('upgrade failed', { status: 400 });
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      void getParticipantByToken(ws.data.token).then((session) => {
        if (!session || session.tripId !== ws.data.tripId) {
          ws.close(4001, 'unauthorized');
          return;
        }
        const unsub = subscribeTrip(
          ws.data.tripId,
          ws as unknown as Parameters<typeof subscribeTrip>[1],
        );
        ws.data.unsub = unsub;
      });
    },
    close(ws) {
      ws.data.unsub?.();
    },
  },
});

console.log(`API http://localhost:${server.port}`);

export type App = typeof app;
