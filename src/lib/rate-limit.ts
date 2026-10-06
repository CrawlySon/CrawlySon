// Jednoduchý limiter pokusov v pamäti procesu (posuvné okno).
//
// Na Verceli žije každá inštancia funkcie zvlášť, takže limit nie je globálny –
// ale aj tak zastaví hádanie hesla či registračného kódu z jedného miesta
// (jedna inštancia obslúži desiatky požiadaviek za sebou) a nič nestojí.
// Globálny limit (Redis) príde až s otvorením appky verejnosti.
type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_KEYS) buckets.clear(); // ochrana pamäte
    b = { hits: [] };
    buckets.set(key, b);
  }
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    const retryAfterSec = Math.ceil((windowMs - (now - b.hits[0])) / 1000);
    return { ok: false, retryAfterSec };
  }
  b.hits.push(now);
  return { ok: true, retryAfterSec: 0 };
}

// IP klienta za Vercel proxy (prvá v x-forwarded-for), inak „unknown“.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

// Len pre testy.
export function _resetRateLimit() {
  buckets.clear();
}
