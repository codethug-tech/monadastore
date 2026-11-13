// Automatic BCV (Banco Central de Venezuela) exchange rate.
//
// The official rate is published once per business day. Fetching it on every
// render would be wasteful and would make the storefront wait on a third party,
// so the last good value is cached for the day and reused instantly.
//
// The API is free, needs no key, and sends `access-control-allow-origin: *`,
// so the browser can call it directly. If it is ever unreachable the caller
// keeps whatever rate it already had, so prices never collapse to zero.

const BCV_ENDPOINT = 'https://ve.dolarapi.com/v1/dolares/oficial';
const CACHE_KEY = 'monada_bcv_rate';
const REQUEST_TIMEOUT_MS = 8000;

export interface BcvRate {
  /** Bolívares per US dollar. */
  rate: number;
  /** When the rate itself was last published by the source, if known. */
  publishedAt: string | null;
  /** When this browser last refreshed it. */
  fetchedAt: number;
}

interface CachedBcvRate extends BcvRate {}

function isUsableRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** The calendar day in Venezuela (UTC-4), used to cache one rate per day. */
function venezuelaDay(date = new Date()): string {
  // Venezuela is a fixed UTC-4 offset with no daylight saving.
  const shifted = new Date(date.getTime() - 4 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function readCache(): CachedBcvRate | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !isUsableRate(parsed.rate)) return null;
    return {
      rate: parsed.rate,
      publishedAt: typeof parsed.publishedAt === 'string' ? parsed.publishedAt : null,
      fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeCache(value: CachedBcvRate): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* private mode or quota: the in-memory value still works this session */
  }
}

/** The last rate this browser saw, without any network call. */
export function getCachedBcvRate(): BcvRate | null {
  return readCache();
}

/** True when the cached rate was fetched today (Venezuela time). */
export function isBcvRateFreshToday(value: BcvRate | null): boolean {
  if (!value) return false;
  return venezuelaDay(new Date(value.fetchedAt)) === venezuelaDay();
}

/**
 * Fetches the official BCV rate.
 *
 * Returns the cached value when it is already from today, so a page reload does
 * not hit the network again. Resolves to `null` when the rate is unknown and
 * could not be fetched; callers should then keep their current rate.
 */
export async function fetchBcvRate(options?: { force?: boolean }): Promise<BcvRate | null> {
  const cached = readCache();
  if (!options?.force && isBcvRateFreshToday(cached)) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(BCV_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      // The rate changes once a day; let the CDN serve it rather than a fresh
      // round trip on every visit.
      cache: 'no-cache',
    });
    if (!res.ok) {
      console.warn('[bcv] rate lookup failed:', res.status);
      return cached;
    }

    const data = await res.json();
    // The source reports the official rate in `promedio`. `venta`/`compra` are
    // null for the BCV feed, so only fall back when they are real numbers.
    const rate = [data?.promedio, data?.venta, data?.compra].find(isUsableRate);
    if (!isUsableRate(rate)) {
      console.warn('[bcv] response had no usable rate');
      return cached;
    }

    const next: CachedBcvRate = {
      rate,
      publishedAt:
        typeof data?.fechaActualizacion === 'string' ? data.fechaActualizacion : null,
      fetchedAt: Date.now(),
    };
    writeCache(next);
    return next;
  } catch (err) {
    // Offline, timeout, or CORS trouble. Keep the last known rate.
    console.warn('[bcv] rate lookup failed:', err instanceof Error ? err.message : err);
    return cached;
  } finally {
    clearTimeout(timer);
  }
}
