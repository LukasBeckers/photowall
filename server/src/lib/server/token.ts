// HMAC-signed QR access tokens. Used to bypass the typed party password when a
// guest scans the entrance QR code. Token format:
//   v1.<base64url(payload)>.<base64url(sig)>
// where payload = JSON({"iat":<ms>,"exp":<ms>,"label":"<optional>"})
import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';

function secret(): Buffer {
  const s = process.env.QR_TOKEN_SECRET;
  if (!s) throw new Error('QR_TOKEN_SECRET is not set');
  return Buffer.from(s, 'utf8');
}

function b64uEncode(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}
function b64uDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

export interface QrPayload {
  iat: number;
  exp: number;
  label?: string;
}

export function issueToken(opts: { ttlMs?: number; label?: string } = {}): string {
  const ttl = opts.ttlMs ?? 1000 * 60 * 60 * 24 * 14; // 14 days default
  const now = Date.now();
  const payload: QrPayload = { iat: now, exp: now + ttl, label: opts.label };
  const body = b64uEncode(JSON.stringify(payload));
  const sig = createHmac('sha256', secret()).update(`${VERSION}.${body}`).digest();
  return `${VERSION}.${body}.${b64uEncode(sig)}`;
}

export function verifyToken(token: string): QrPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [v, body, sigStr] = parts;
  if (v !== VERSION) return null;

  const expected = createHmac('sha256', secret()).update(`${v}.${body}`).digest();
  const provided = b64uDecode(sigStr);
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(b64uDecode(body).toString('utf8')) as QrPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
