import { eq, and, inArray, asc } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { db } from '../db/client.js';
import {
  trips,
  participants,
  receipts,
  lineItems,
  itemSelections,
} from '../db/schema.js';
import { createSession, getParticipantByToken } from '../auth.js';
import { normalizePhoneRu } from '../lib/phone.js';
import { ReceiptParser } from '../lib/receipt-parser.js';
import { sendChequeRequest } from '../lib/request-for-check.js';
import { randomSlug } from '../slug.js';
import { broadcastTrip } from '../realtime.js';
import { computeMatrixForTrip } from '../services/settlement-from-db.js';
import {
  expandPositionsFromReceipt,
  rubToKopecks,
} from '../lib/expand-positions.js';

const COOKIE = 'splich_session';

async function findTripBySlug(slug: string) {
  const rows = await db.select().from(trips).where(eq(trips.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export const apiRoutes = new Elysia({ prefix: '/api' })
    .onError(({ code, error, set }) => {
        if (code === 'VALIDATION') {
            set.status = 422
            return {
                status: 'error',
                type: 'validation',
                // error.message будет содержать вашу строку из схемы
                message: error.message,
                // Если нужно прокинуть все детали валидации:
                errors: error.all
            }
        }
    })
  .derive(async ({ cookie, request }) => {
    const headerToken = request.headers.get('x-session-token');
    const token = headerToken !== null
      ? (headerToken || undefined)
      : (cookie[COOKIE]?.value ?? undefined) as string;
    const session = await getParticipantByToken(token);
    return { sessionToken: token, session };
  })
  /** Создать поездку и администратора */
  .post(
    '/trips',
    async ({ body, set }) => {
      const phone = normalizePhoneRu(body.phone);
      if (phone.length < 11) {
        set.status = 400;
        return { error: 'Некорректный телефон' };
      }
      const slug = randomSlug();
      const joinHash = body.joinPassword
        ? await Bun.password.hash(body.joinPassword)
        : null;
      const [trip] = await db
        .insert(trips)
        .values({
          slug,
          name: body.tripName,
          joinPasswordHash: joinHash,
        })
        .returning();

      if (!trip) {
        set.status = 500;
        return { error: 'Не удалось создать поездку' };
      }

      const passHash = await Bun.password.hash(body.password);
      const [admin] = await db
        .insert(participants)
        .values({
          tripId: trip.id,
          name: body.name,
          passwordHash: passHash,
          phoneNormalized: phone,
          bank: body.bank,
          isAdmin: true,
        })
        .returning();

      if (!admin) {
        set.status = 500;
        return { error: 'Не удалось создать профиль' };
      }

      const token = await createSession(admin.id);
      set.headers['Set-Cookie'] = `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
      return {
        slug: trip.slug,
        tripId: trip.id,
        participantId: admin.id,
        /** Для WebSocket (кука HttpOnly недоступна из JS) */
        sessionToken: token,
      };
    },
    {
      body: t.Object({
        tripName: t.String({ minLength: 3, error: 'Имя поездки должно быть длиннее 3 символов' }),
        joinPassword: t.Optional(t.String()),
        name: t.String({ minLength: 3, error: 'Имя должно быть длиннее 3 символов' }),
        password: t.String({ minLength: 4, error: 'Пароль должен быть длиннее 3 символов' }),
        phone: t.String({ minLength: 5, error: 'Телефон должен быть длиннее 5 символов'  }),
        bank: t.String({ minLength: 1, error: 'Банк не может быть пустым'  }),
      }),
    },
  )
  /** Войти или зарегистрироваться в поездке */
  .post(
    '/trips/:slug/join',
    async ({ params, body, set }) => {
      const trip = await findTripBySlug(params.slug);
      if (!trip) {
        set.status = 404;
        return { error: 'Поездка не найдена' };
      }
      if (trip.joinPasswordHash && body.joinPassword) {
        const ok = await Bun.password.verify(body.joinPassword, trip.joinPasswordHash);
        if (!ok) {
          set.status = 403;
          return { error: 'Неверный пароль комнаты' };
        }
      } else if (trip.joinPasswordHash && !body.joinPassword) {
        set.status = 403;
        return { error: 'Нужен пароль комнаты' };
      }

      const phone = normalizePhoneRu(body.phone);
      const existing = await db
        .select()
        .from(participants)
        .where(
          and(eq(participants.tripId, trip.id), eq(participants.phoneNormalized, phone)),
        )
        .limit(1);

      let participantId: string;

      if (existing[0]) {
        const ok = await Bun.password.verify(body.password, existing[0].passwordHash);
        if (!ok) {
          set.status = 403;
          return { error: 'Неверный пароль участника' };
        }
        participantId = existing[0].id;
      } else {
        const passHash = await Bun.password.hash(body.password);
        const [p] = await db
          .insert(participants)
          .values({
            tripId: trip.id,
            name: body.name,
            passwordHash: passHash,
            phoneNormalized: phone,
            bank: body.bank,
            isAdmin: false,
          })
          .returning();
        if (!p) {
          set.status = 500;
          return { error: 'Ошибка регистрации' };
        }
        participantId = p.id;
      }

      const token = await createSession(participantId);
      set.headers['Set-Cookie'] = `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
      return { tripId: trip.id, participantId, sessionToken: token };
    },
    {
      params: t.Object({ slug: t.String() }),
      body: t.Object({
        name: t.String({ minLength: 1, error: 'Имя не может быть пустым'}),
        password: t.String({ minLength: 4, error: 'Пароль должен быть длиннее 4 символов' }),
        phone: t.String({ minLength: 5, error: 'Телефон должен быть длиннее 4 символов' }),
        bank: t.String({ minLength: 1, error: 'Банк не может быть пустым' }),
        joinPassword: t.Optional(t.String()),
      }),
    },
  )
  /** Полное состояние поездки для клиента */
  .get('/trips/:slug', async ({ params, session, set }) => {
    const trip = await findTripBySlug(params.slug);
    if (!trip) {
      set.status = 404;
      return { error: 'Не найдено' };
    }

    const plist = await db
      .select()
      .from(participants)
      .where(eq(participants.tripId, trip.id));

    const rlist = await db
      .select()
      .from(receipts)
      .where(eq(receipts.tripId, trip.id));

    const lines = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.tripId, trip.id))
      .orderBy(asc(lineItems.sortOrder));

    const lineIds = lines.map((l) => l.id);
    const sels =
      lineIds.length === 0
        ? []
        : await db
            .select()
            .from(itemSelections)
            .where(inArray(itemSelections.lineItemId, lineIds));

    const countByLine = new Map<string, number>();
    const mySelection = new Set<string>();
    const sameTrip = !!session && session.tripId === trip.id;
    for (const s of sels) {
      countByLine.set(s.lineItemId, (countByLine.get(s.lineItemId) ?? 0) + 1);
      if (sameTrip && s.participantId === session!.participantId) {
        mySelection.add(s.lineItemId);
      }
    }

    const payerNames = new Map(plist.map((p) => [p.id, p.name] as const));

    return {
      trip: {
        id: trip.id,
        slug: trip.slug,
        name: trip.name,
        finishedAt: trip.finishedAt?.toISOString() ?? null,
      },
      me: sameTrip
        ? {
            participantId: session!.participantId,
            isAdmin: session!.isAdmin,
          }
        : null,
      participants: plist.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phoneNormalized,
        bank: p.bank,
        isAdmin: p.isAdmin,
      })),
      receipts: rlist.map((r) => ({
        id: r.id,
        institution: r.institution,
        isManual: r.isManual,
        officialTotalKopecks: r.officialTotalKopecks,
        payerId: r.payerId,
        payerName: payerNames.get(r.payerId) ?? '',
        fn: r.fn,
        fd: r.fd,
        fp: r.fp,
        datetime: r.receiptDatetime,
      })),
      lineItems: lines.map((li) => ({
        id: li.id,
        receiptId: li.receiptId,
        name: li.name,
        unit: li.unit,
        quantity: li.quantity,
        priceKopecks: li.priceKopecks,
        forcedForAll: li.forcedForAll,
        selectedCount: countByLine.get(li.id) ?? 0,
        mySelected: mySelection.has(li.id) || (li.forcedForAll && sameTrip),
      })),
    };
  })
  /** Сканирование чека по ФН-ФД-ФП */
  .post(
    '/trips/:slug/receipts/scan',
    async ({ params, body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { error: 'Нужна сессия' };
      }
      const trip = await findTripBySlug(params.slug);
      if (!trip || trip.id !== session.tripId) {
        set.status = 404;
        return { error: 'Поездка не найдена' };
      }
      if (trip.finishedAt) {
        set.status = 400;
        return { error: 'Поездка закрыта' };
      }

      const res = await sendChequeRequest({
        fn: body.fn,
        fd: body.fd,
        fp: body.fp,
        total: body.total,
        date: body.date,
        time: body.time,
      });

      if (res.status === 'error') {
        set.status = 502;
        return { error: res.error ?? 'Не удалось получить чек' };
      }

      let parsed;
      try {
        parsed = new ReceiptParser(res.data).parse();
      } catch {
        set.status = 422;
        return { error: 'Не удалось разобрать ответ проверки чека' };
      }

      const officialK = rubToKopecks(parsed.total);
      const [rec] = await db
        .insert(receipts)
        .values({
          tripId: trip.id,
          payerId: session.participantId,
          institution: parsed.institution || 'Чек',
          isManual: false,
          officialTotalKopecks: officialK,
          fn: body.fn,
          fd: body.fd,
          fp: body.fp,
          receiptDatetime: parsed.datetime,
          rawHtml: res.data,
        })
        .returning();

      if (!rec) {
        set.status = 500;
        return { error: 'Ошибка сохранения' };
      }

      let order = 0;
      const rows: (typeof lineItems.$inferInsert)[] = [];
      for (const p of parsed.positions) {
        const units = expandPositionsFromReceipt(p);
        for (const u of units) {
          rows.push({
            tripId: trip.id,
            receiptId: rec.id,
            name: u.name,
            unit: null,
            quantity: 1,
            priceKopecks: u.priceKopecks,
            forcedForAll: false,
            sortOrder: order++,
          });
        }
      }

      if (rows.length > 0) {
        await db.insert(lineItems).values(rows);
      }

      broadcastTrip(trip.id, { type: 'trip_updated' });
      return { receiptId: rec.id };
    },
    {
      params: t.Object({ slug: t.String() }),
      body: t.Object({
        fn: t.String(),
        fd: t.String(),
        fp: t.String(),
        total: t.String(),
        date: t.String(),
        time: t.String(),
      }),
    },
  )
  /** Ручная позиция (например бензин) */
  .post(
    '/trips/:slug/receipts/manual',
    async ({ params, body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { error: 'Нужна сессия' };
      }
      const trip = await findTripBySlug(params.slug);
      if (!trip || trip.id !== session.tripId) {
        set.status = 404;
        return { error: 'Не найдено' };
      }
      if (trip.finishedAt) {
        set.status = 400;
        return { error: 'Поездка закрыта' };
      }

      const priceK = rubToKopecks(body.priceRub);
      const [rec] = await db
        .insert(receipts)
        .values({
          tripId: trip.id,
          payerId: session.participantId,
          institution: body.name,
          isManual: true,
          officialTotalKopecks: priceK,
          fn: null,
          fd: null,
          fp: null,
          receiptDatetime: null,
          rawHtml: null,
        })
        .returning();

      if (!rec) {
        set.status = 500;
        return { error: 'Ошибка' };
      }

      await db.insert(lineItems).values({
        tripId: trip.id,
        receiptId: rec.id,
        name: body.name,
        unit: body.unit ?? null,
        quantity: 1,
        priceKopecks: priceK,
        forcedForAll: false,
        sortOrder: 0,
      });

      broadcastTrip(trip.id, { type: 'trip_updated' });
      return { receiptId: rec.id };
    },
    {
      params: t.Object({ slug: t.String() }),
      body: t.Object({
        name: t.String({ minLength: 1 }),
        priceRub: t.Number(),
        unit: t.Optional(t.String()),
      }),
    },
  )
  /** Сменить плательщика чека (админ) */
  .patch(
    '/trips/:slug/receipts/:receiptId',
    async ({ params, body, session, set }) => {
      if (!session?.isAdmin) {
        set.status = 403;
        return { error: 'Только администратор' };
      }
      const trip = await findTripBySlug(params.slug);
      if (!trip || trip.id !== session.tripId) {
        set.status = 404;
        return { error: 'Не найдено' };
      }
      if (trip.finishedAt) {
        set.status = 400;
        return { error: 'Поездка закрыта' };
      }

      const [rec] = await db
        .select()
        .from(receipts)
        .where(and(eq(receipts.id, params.receiptId), eq(receipts.tripId, trip.id)))
        .limit(1);
      if (!rec) {
        set.status = 404;
        return { error: 'Чек не найден' };
      }

      const [payer] = await db
        .select()
        .from(participants)
        .where(
          and(eq(participants.id, body.payerId), eq(participants.tripId, trip.id)),
        )
        .limit(1);
      if (!payer) {
        set.status = 400;
        return { error: 'Участник не найден' };
      }

      if (rec.payerId !== body.payerId) {
        await db
          .update(receipts)
          .set({ payerId: body.payerId })
          .where(eq(receipts.id, rec.id));
        broadcastTrip(trip.id, { type: 'trip_updated' });
      }

      return { ok: true };
    },
    {
      params: t.Object({ slug: t.String(), receiptId: t.String() }),
      body: t.Object({ payerId: t.String() }),
    },
  )
  /** Переключить свою отметку по позиции */
  .post(
    '/trips/:slug/line-items/:lineId/toggle',
    async ({ params, session, set }) => {
      if (!session) {
        set.status = 401;
        return { error: 'Нужна сессия' };
      }
      const trip = await findTripBySlug(params.slug);
      if (!trip || trip.id !== session.tripId) {
        set.status = 404;
        return { error: 'Не найдено' };
      }
      if (trip.finishedAt) {
        set.status = 400;
        return { error: 'Поездка закрыта' };
      }

      const [li] = await db
        .select()
        .from(lineItems)
        .where(
          and(eq(lineItems.id, params.lineId), eq(lineItems.tripId, trip.id)),
        )
        .limit(1);

      if (!li) {
        set.status = 404;
        return { error: 'Позиция не найдена' };
      }
      if (li.forcedForAll) {
        set.status = 400;
        return { error: 'Позиция заблокирована администратором' };
      }

      const existing = await db
        .select()
        .from(itemSelections)
        .where(
          and(
            eq(itemSelections.lineItemId, li.id),
            eq(itemSelections.participantId, session.participantId),
          ),
        )
        .limit(1);

      if (existing[0]) {
        await db
          .delete(itemSelections)
          .where(
            and(
              eq(itemSelections.lineItemId, li.id),
              eq(itemSelections.participantId, session.participantId),
            ),
          );
      } else {
        await db.insert(itemSelections).values({
          lineItemId: li.id,
          participantId: session.participantId,
        });
      }

      broadcastTrip(trip.id, { type: 'trip_updated' });
      return { ok: true };
    },
    { params: t.Object({ slug: t.String(), lineId: t.String() }) },
  )
  /** Редактирование позиции: админ или плательщик чека; forcedForAll — только админ */
  .patch(
    '/trips/:slug/line-items/:lineId',
    async ({ params, body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { error: 'Нужна сессия' };
      }
      const trip = await findTripBySlug(params.slug);
      if (!trip || trip.id !== session.tripId) {
        set.status = 404;
        return { error: 'Не найдено' };
      }

      const [li] = await db
        .select()
        .from(lineItems)
        .where(
          and(eq(lineItems.id, params.lineId), eq(lineItems.tripId, trip.id)),
        )
        .limit(1);

      if (!li) {
        set.status = 404;
        return { error: 'Позиция не найдена' };
      }

      const [rec] = await db
        .select()
        .from(receipts)
        .where(eq(receipts.id, li.receiptId))
        .limit(1);

      const canEdit =
        session.isAdmin || (rec && rec.payerId === session.participantId);
      if (!canEdit) {
        set.status = 403;
        return { error: 'Нет прав' };
      }

      if (body.forcedForAll !== undefined && !session.isAdmin) {
        set.status = 403;
        return { error: 'Только администратор может блокировать позицию' };
      }

      const updates: Partial<typeof lineItems.$inferInsert> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.priceKopecks !== undefined) updates.priceKopecks = body.priceKopecks;
      if (body.forcedForAll !== undefined) {
        updates.forcedForAll = body.forcedForAll;
      }

      if (Object.keys(updates).length > 0) {
        await db.update(lineItems).set(updates).where(eq(lineItems.id, li.id));
      }

      if (body.forcedForAll === true) {
        const plist = await db
          .select()
          .from(participants)
          .where(eq(participants.tripId, trip.id));
        for (const p of plist) {
          await db
            .insert(itemSelections)
            .values({ lineItemId: li.id, participantId: p.id })
            .onConflictDoNothing();
        }
      }

      if (rec && body.priceKopecks !== undefined) {
        const sumLines = await db
          .select()
          .from(lineItems)
          .where(eq(lineItems.receiptId, rec.id));
        const total = sumLines.reduce((s, l) => s + l.priceKopecks, 0);
        await db
          .update(receipts)
          .set({ officialTotalKopecks: total })
          .where(eq(receipts.id, rec.id));
      }

      broadcastTrip(trip.id, { type: 'trip_updated' });
      return { ok: true };
    },
    {
      params: t.Object({ slug: t.String(), lineId: t.String() }),
      body: t.Object({
        forcedForAll: t.Optional(t.Boolean()),
        name: t.Optional(t.String()),
        priceKopecks: t.Optional(t.Integer()),
      }),
    },
  )
  .delete(
    '/trips/:slug/line-items/:lineId',
    async ({ params, session, set }) => {
      if (!session) {
        set.status = 401;
        return { error: 'Нужна сессия' };
      }
      const trip = await findTripBySlug(params.slug);
      if (!trip || trip.id !== session.tripId) {
        set.status = 404;
        return { error: 'Не найдено' };
      }

      const [li] = await db
        .select()
        .from(lineItems)
        .where(
          and(eq(lineItems.id, params.lineId), eq(lineItems.tripId, trip.id)),
        )
        .limit(1);

      if (!li) {
        set.status = 404;
        return { error: 'Позиция не найдена' };
      }

      const [rec] = await db
        .select()
        .from(receipts)
        .where(eq(receipts.id, li.receiptId))
        .limit(1);

      const canDelete =
        session.isAdmin || (rec && rec.payerId === session.participantId);
      if (!canDelete) {
        set.status = 403;
        return { error: 'Нет прав' };
      }

      await db.delete(lineItems).where(eq(lineItems.id, li.id));

      if (rec) {
        const rest = await db
          .select()
          .from(lineItems)
          .where(eq(lineItems.receiptId, rec.id));
        if (rest.length === 0) {
          await db.delete(receipts).where(eq(receipts.id, rec.id));
        } else {
          const total = rest.reduce((s, l) => s + l.priceKopecks, 0);
          await db
            .update(receipts)
            .set({ officialTotalKopecks: total })
            .where(eq(receipts.id, rec.id));
        }
      }

      broadcastTrip(trip.id, { type: 'trip_updated' });
      return { ok: true };
    },
    { params: t.Object({ slug: t.String(), lineId: t.String() }) },
  )
  /** Закрыть поездку (админ) */
  .post(
    '/trips/:slug/finish',
    async ({ params, session, set }) => {
      if (!session?.isAdmin) {
        set.status = 403;
        return { error: 'Только администратор' };
      }
      const trip = await findTripBySlug(params.slug);
      if (!trip || trip.id !== session.tripId) {
        set.status = 404;
        return { error: 'Не найдено' };
      }
      await db
        .update(trips)
        .set({ finishedAt: new Date() })
        .where(eq(trips.id, trip.id));
      broadcastTrip(trip.id, { type: 'trip_updated' });
      return { ok: true };
    },
    { params: t.Object({ slug: t.String() }) },
  )
  /** Переименовать поездку */
  .patch(
    '/trips/:slug',
    async ({ params, body, session, set }) => {
      if (!session?.isAdmin) {
        set.status = 403;
        return { error: 'Только администратор' };
      }
      const trip = await findTripBySlug(params.slug);
      if (!trip || trip.id !== session.tripId) {
        set.status = 404;
        return { error: 'Не найдено' };
      }
      await db.update(trips).set({ name: body.name }).where(eq(trips.id, trip.id));
      broadcastTrip(trip.id, { type: 'trip_updated' });
      return { ok: true };
    },
    {
      params: t.Object({ slug: t.String() }),
      body: t.Object({ name: t.String({ minLength: 1 }) }),
    },
  )
  /** Удалить участника */
  .delete(
    '/trips/:slug/participants/:participantId',
    async ({ params, session, set }) => {
      if (!session?.isAdmin) {
        set.status = 403;
        return { error: 'Только администратор' };
      }
      if (params.participantId === session.participantId) {
        set.status = 400;
        return { error: 'Нельзя удалить себя' };
      }
      const trip = await findTripBySlug(params.slug);
      if (!trip || trip.id !== session.tripId) {
        set.status = 404;
        return { error: 'Не найдено' };
      }
      await db
        .delete(participants)
        .where(
          and(
            eq(participants.id, params.participantId),
            eq(participants.tripId, trip.id),
          ),
        );
      broadcastTrip(trip.id, { type: 'trip_updated' });
      return { ok: true };
    },
    {
      params: t.Object({ slug: t.String(), participantId: t.String() }),
    },
  )
  /** Матрица долгов */
  .get('/trips/:slug/settlement', async ({ params, session, set }) => {
    const trip = await findTripBySlug(params.slug);
    if (!trip) {
      set.status = 404;
      return { error: 'Не найдено' };
    }
    if (!session || session.tripId !== trip.id) {
      set.status = 401;
      return { error: 'Нужна сессия' };
    }

    const matrix = await computeMatrixForTrip(trip.id);
    const plist = await db
      .select()
      .from(participants)
      .where(eq(participants.tripId, trip.id));
    const names = new Map(plist.map((p) => [p.id, {name: p.name, bank: p.bank, phone: p.phoneNormalized}] as const));

    return {
      participantIds: matrix.participantIds,
      names: Object.fromEntries(matrix.participantIds.map((id) => [id, names.get(id) ?? ''])),
      kopecks: matrix.kopecks,
    };
  });
