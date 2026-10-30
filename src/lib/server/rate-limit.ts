/** Fixed-window limiter, per server instance. Good enough to stop accidental floods and cheap abuse of AI/send endpoints.
 *  For multi-instance production traffic, swap the Map for a shared store (e.g. Upstash Redis). Documented in README. */
const hits = new Map<string, { n: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return { ok: true, retryAfter: 0 }; }
  h.n += 1;
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  return h.n <= limit ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: Math.ceil((h.reset - now) / 1000) };
}
