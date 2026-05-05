import jwt from 'jsonwebtoken';
import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';

const SESSION_COOKIE = 'pw_session';
const ADMIN_COOKIE = 'pw_admin';
const SESSION_TTL_DAYS = 30;
const ADMIN_TTL_HOURS = 12;

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

interface SessionToken {
  sid: string;
  name: string;
}

interface AdminToken {
  admin: true;
}

const cookieOpts = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  // secure flag is auto-managed by SvelteKit when behind https; keep false here
  // because Caddy terminates TLS and forwards as http internally.
  secure: false
};

// --- Guest session ---

export async function createSession(displayName: string): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.sessions)
    .values({ displayName })
    .returning({ id: schema.sessions.id });
  return row;
}

export function setSessionCookie(cookies: Cookies, sid: string, name: string) {
  const token = jwt.sign({ sid, name } as SessionToken, jwtSecret(), {
    expiresIn: `${SESSION_TTL_DAYS}d`
  });
  cookies.set(SESSION_COOKIE, token, {
    ...cookieOpts,
    maxAge: 60 * 60 * 24 * SESSION_TTL_DAYS
  });
}

export function clearSessionCookie(cookies: Cookies) {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function readSessionFromCookies(
  cookies: Cookies
): Promise<{ id: string; displayName: string } | null> {
  const raw = cookies.get(SESSION_COOKIE);
  if (!raw) return null;
  let payload: SessionToken;
  try {
    payload = jwt.verify(raw, jwtSecret()) as SessionToken;
  } catch {
    return null;
  }
  // Verify session row still exists (handles deletes/cookie reuse)
  const rows = await db
    .select({ id: schema.sessions.id, displayName: schema.sessions.displayName })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, payload.sid))
    .limit(1);
  if (!rows.length) return null;
  return rows[0];
}

// --- Admin session ---

export function setAdminCookie(cookies: Cookies) {
  const token = jwt.sign({ admin: true } as AdminToken, jwtSecret(), {
    expiresIn: `${ADMIN_TTL_HOURS}h`
  });
  cookies.set(ADMIN_COOKIE, token, {
    ...cookieOpts,
    maxAge: 60 * 60 * ADMIN_TTL_HOURS
  });
}

export function clearAdminCookie(cookies: Cookies) {
  cookies.delete(ADMIN_COOKIE, { path: '/' });
}

export function readAdminFromCookies(cookies: Cookies): boolean {
  const raw = cookies.get(ADMIN_COOKIE);
  if (!raw) return false;
  try {
    const payload = jwt.verify(raw, jwtSecret()) as AdminToken;
    return payload.admin === true;
  } catch {
    return false;
  }
}

// --- Password checks (constant-time) ---

import { timingSafeEqual } from 'node:crypto';

export function checkPartyPassword(input: string): boolean {
  const expected = process.env.PARTY_PASSWORD;
  if (!expected) return false;
  return constantTimeEqual(input, expected);
}

export function checkAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return constantTimeEqual(input, expected);
}

export function checkWatcherToken(input: string): boolean {
  const expected = process.env.WATCHER_TOKEN;
  if (!expected) return false;
  return constantTimeEqual(input, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
