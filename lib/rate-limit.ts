/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Works on a single server instance. Suitable for low-throughput public
 * endpoints (contact form, login attempts) where blocking at ~5 requests
 * per window is acceptable even without distributed coordination.
 *
 * Returns `allowed: false` after `limit` requests within `windowMs` ms.
 * All keys are evicted automatically when their window expires.
 */
const stores = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let timestamps = stores.get(key);
  if (!timestamps) {
    timestamps = [];
    stores.set(key, timestamps);
  }

  // Evict entries outside the window.
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= limit) {
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  return { allowed: true, remaining: limit - timestamps.length - 1 };
}
