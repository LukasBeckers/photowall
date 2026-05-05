// Tiny in-process token-bucket rate limiter, keyed by an arbitrary string
// (typically IP). Buckets refill linearly; allow() returns true if the request
// can proceed.

interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface Limiter {
  capacity: number;
  refillPerMs: number;
  buckets: Map<string, Bucket>;
}

const limiters = new Map<string, Limiter>();
const PRUNE_AFTER_MS = 1000 * 60 * 30; // 30 min

function get(name: string, capacity: number, refillPerSec: number): Limiter {
  let l = limiters.get(name);
  if (!l) {
    l = { capacity, refillPerMs: refillPerSec / 1000, buckets: new Map() };
    limiters.set(name, l);
  }
  return l;
}

export function allow(
  limiterName: string,
  key: string,
  opts: { capacity: number; refillPerSec: number }
): boolean {
  const l = get(limiterName, opts.capacity, opts.refillPerSec);
  const now = Date.now();
  let b = l.buckets.get(key);
  if (!b) {
    b = { tokens: l.capacity, lastRefill: now };
    l.buckets.set(key, b);
  }
  // Refill since last check
  const elapsed = now - b.lastRefill;
  if (elapsed > 0) {
    b.tokens = Math.min(l.capacity, b.tokens + elapsed * l.refillPerMs);
    b.lastRefill = now;
  }
  if (b.tokens < 1) return false;
  b.tokens -= 1;

  // Cheap occasional prune to keep memory bounded
  if (l.buckets.size > 1000) {
    for (const [k, v] of l.buckets) {
      if (now - v.lastRefill > PRUNE_AFTER_MS) l.buckets.delete(k);
    }
  }
  return true;
}

export function clientIp(req: Request, getClientAddress?: () => string): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return getClientAddress?.() ?? 'unknown';
}
