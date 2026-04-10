import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  joinPasswordHash: text('join_password_hash'),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const participants = pgTable(
  'participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    phoneNormalized: text('phone_normalized').notNull(),
    bank: text('bank').notNull(),
    isAdmin: boolean('is_admin').notNull().default(false),
  },
  (t) => [uniqueIndex('participants_trip_phone').on(t.tripId, t.phoneNormalized)],
);

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  payerId: uuid('payer_id')
    .notNull()
    .references(() => participants.id, { onDelete: 'cascade' }),
  institution: text('institution').notNull(),
  isManual: boolean('is_manual').notNull().default(false),
  officialTotalKopecks: integer('official_total_kopecks').notNull(),
  fn: text('fn'),
  fd: text('fd'),
  fp: text('fp'),
  receiptDatetime: text('receipt_datetime'),
  rawHtml: text('raw_html'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lineItems = pgTable('line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  receiptId: uuid('receipt_id')
    .notNull()
    .references(() => receipts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  unit: text('unit'),
  /** Всегда 1 после нормализации при вставке из чека */
  quantity: integer('quantity').notNull().default(1),
  priceKopecks: integer('price_kopecks').notNull(),
  forcedForAll: boolean('forced_for_all').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const itemSelections = pgTable(
  'item_selections',
  {
    lineItemId: uuid('line_item_id')
      .notNull()
      .references(() => lineItems.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.lineItemId, t.participantId] }),
  }),
);
