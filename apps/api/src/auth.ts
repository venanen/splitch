import { and, eq, gt } from 'drizzle-orm';
import { db } from './db/client.js';
import { participants, sessions } from './db/schema.js';

const DAY_MS = 864e5 * 30;

export function randomToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}

export async function createSession(participantId: string): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + DAY_MS);
  await db.insert(sessions).values({ token, participantId, expiresAt });
  return token;
}

export async function getParticipantByToken(
  token: string | undefined,
): Promise<{ participantId: string; tripId: string; isAdmin: boolean } | null> {
  if (!token) return null;
  const rows = await db
    .select({
      participantId: participants.id,
      tripId: participants.tripId,
      isAdmin: participants.isAdmin,
    })
    .from(sessions)
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}
