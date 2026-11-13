// Tests for the automatic BCV rate: response parsing, the per-day cache, and
// the fallback that keeps prices sane when the feed is unreachable.
// Run: npm test
import assert from 'node:assert/strict';
import { fetchBcvRate, getCachedBcvRate, isBcvRateFreshToday, type BcvRate } from '../src/lib/bcv';

let pass = 0;
const check = (label: string, fn: () => void | Promise<void>) => {
  const result = fn();
  if (result instanceof Promise) {
    return result.then(() => {
      pass++;
      console.log(`  ok  ${label}`);
    });
  }
  pass++;
  console.log(`  ok  ${label}`);
};

// --- a minimal localStorage + fetch, so the module runs outside a browser ---
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

function mockFetch(impl: () => Promise<any>) {
  (globalThis as any).fetch = impl;
}

async function main() {
  console.log('\nBCV automatic rate');

  // A real DolarAPI payload: `promedio` carries the official rate while
  // compra/venta are null, so a naive read of `venta` would yield 0.
  mockFetch(async () => okResponse({
    moneda: 'USD',
    fuente: 'oficial',
    nombre: 'Dólar',
    compra: null,
    venta: null,
    promedio: 911.6243,
    fechaActualizacion: '2026-11-13T00:00:00-04:00',
  }));

  const first = await fetchBcvRate({ force: true });
  await check('parses the official rate from promedio', () => {
    assert.ok(first, 'expected a rate');
    assert.equal(first!.rate, 911.6243);
  });

  await check('keeps the published timestamp', () => {
    assert.equal(first!.publishedAt, '2026-11-13T00:00:00-04:00');
  });

  await check('caches the fetched rate', () => {
    const cached = getCachedBcvRate();
    assert.ok(cached, 'expected a cached rate');
    assert.equal(cached!.rate, 911.6243);
  });

  await check('a rate fetched today counts as fresh', () => {
    assert.equal(isBcvRateFreshToday(first), true);
  });

  await check("yesterday's rate is not fresh", () => {
    const old: BcvRate = {
      rate: 900,
      publishedAt: null,
      fetchedAt: Date.now() - 26 * 60 * 60 * 1000,
    };
    assert.equal(isBcvRateFreshToday(old), false);
  });

  await check('returns the cached value without a second network call once fresh', async () => {
    let calls = 0;
    mockFetch(async () => {
      calls++;
      return okResponse({ promedio: 1 });
    });
    const again = await fetchBcvRate();
    assert.equal(calls, 0, 'should not hit the network when today\'s rate is cached');
    assert.equal(again!.rate, 911.6243);
  });

  await check('falls back to the cached rate when the feed fails', async () => {
    mockFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const result = await fetchBcvRate({ force: true });
    assert.ok(result, 'expected the previous rate to survive');
    assert.equal(result!.rate, 911.6243);
  });

  await check('falls back to the cached rate on a network error', async () => {
    mockFetch(async () => {
      throw new Error('offline');
    });
    const result = await fetchBcvRate({ force: true });
    assert.equal(result!.rate, 911.6243);
  });

  await check('ignores a response with no usable rate', async () => {
    mockFetch(async () => okResponse({ promedio: null, venta: null, compra: null }));
    const result = await fetchBcvRate({ force: true });
    assert.equal(result!.rate, 911.6243, 'must keep the last good value');
  });

  await check('rejects zero and negative rates', async () => {
    for (const bad of [0, -5, 'abc']) {
      mockFetch(async () => okResponse({ promedio: bad }));
      const result = await fetchBcvRate({ force: true });
      assert.equal(result!.rate, 911.6243, `rate ${String(bad)} must not be accepted`);
    }
  });

  await check('uses venta when promedio is absent', async () => {
    mockFetch(async () => okResponse({ compra: null, venta: 905.5 }));
    const result = await fetchBcvRate({ force: true });
    assert.equal(result!.rate, 905.5);
  });

  await check('an $89 piece converts with the live rate', () => {
    const bs = 89 * getCachedBcvRate()!.rate;
    assert.ok(bs > 79000, `expected a realistic Bs total, got ${bs}`);
  });

  console.log(`\n${pass} assertions passed`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
