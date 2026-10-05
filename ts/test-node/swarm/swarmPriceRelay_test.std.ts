// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (PD-5, 2026-10-05): the main process's read of the SWARM
// price service, with a fake fetch and a fake clock. What must hold: one fixed
// URL, GET, no redirects, no cookies; a reading only from a `swarm-price/1`
// document with a positive decimal price; anything else - malformed JSON, the
// wrong schema, the wrong type, an error status, more than 64 KiB, no answer
// within the deadline - is a failure category and the last good reading
// stays; at most one request a minute, and none while nobody asks, while the
// switch is off or off SWARM Mainnet; the freshness words by the clock.

import { assert } from 'chai';

import {
  PRICE_FETCH_EVERY_MS,
  PRICE_MAX_BODY_BYTES,
  SWARM_PRICE_RELAY_URL,
  SwarmPriceTracker,
  fetchPriceRelay,
  readingFromRelayDocument,
} from '../../util/swarm/swarmPriceRelay.std.ts';
import type {
  PriceFetchType,
  SwarmPriceTrackerOptionsType,
} from '../../util/swarm/swarmPriceRelay.std.ts';

const POOL =
  '0xf1e066d77279b388b40fdca7f5cf4a6559f77bdf9e2e8937ce9c2fe2960f4599';
const MINUTE = 60 * 1000;

/** specs/PRICE-DISPLAY.md section 2.1, with the pool id written out. */
function fixture(): Record<string, unknown> {
  return {
    schema: 'swarm-price/1',
    symbol: 'SWM',
    quote: 'USD',
    price_usd: '0.84114343',
    price_eth: '0.000195976',
    change_pct: { h1: 0, h6: 28.75, h24: 36.72 },
    volume_24h_usd: 378.11,
    liquidity_usd: 3761.34,
    fdv_usd: 8411.43,
    source: 'geckoterminal',
    sources: [
      {
        id: 'geckoterminal',
        ok: true,
        price_usd: '0.84114343',
        fetched_unix: 1791223633,
      },
      {
        id: 'dexscreener',
        ok: true,
        price_usd: '0.8602',
        fetched_unix: 1791223633,
      },
    ],
    sparkline_usd: [0.5259, 0.573, 0.6361, 0.6533, 0.7537, 0.8411],
    sparkline_hours: 48,
    pool: {
      chain: 'base',
      dex: 'uniswap-v4',
      id: POOL,
      token: '0xf904C14d21bEF5b8a5345a666C77C9cc2A24043B',
      geckoterminal_url: `https://www.geckoterminal.com/base/pools/${POOL}`,
      dexscreener_url: `https://dexscreener.com/base/${POOL}`,
    },
    generated_unix: 1791223633,
    refresh_seconds: 30,
    stale: false,
  };
}

type CallType = Readonly<{ url: string; init: Parameters<PriceFetchType>[1] }>;

function jsonResponse(
  body: unknown,
  {
    status = 200,
    contentType = 'application/json; charset=utf-8',
  }: { status?: number; contentType?: string } = {}
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

function fakeFetch(answer: (call: CallType) => Promise<Response>): {
  fetch: PriceFetchType;
  calls: Array<CallType>;
} {
  const calls: Array<CallType> = [];
  return {
    calls,
    fetch: async (url, init) => {
      const call = { url, init };
      calls.push(call);
      return answer(call);
    },
  };
}

describe('SWARM price: the price service read (PD-5)', () => {
  describe('one read', () => {
    it('asks the one fixed URL: GET, no redirects, no cookies, no cache', async () => {
      const { fetch, calls } = fakeFetch(async () => jsonResponse(fixture()));
      const result = await fetchPriceRelay({ fetch });
      assert.isTrue(result.ok);
      assert.lengthOf(calls, 1);
      assert.strictEqual(
        calls[0]?.url,
        'https://wallet.swarm.green/api/price/swm'
      );
      assert.strictEqual(calls[0]?.url, SWARM_PRICE_RELAY_URL);
      assert.strictEqual(calls[0]?.init.method, 'GET');
      assert.strictEqual(calls[0]?.init.redirect, 'error');
      assert.strictEqual(calls[0]?.init.credentials, 'omit');
      assert.strictEqual(calls[0]?.init.cache, 'no-store');
      // Nothing about the wallet goes with it.
      assert.deepEqual(calls[0]?.init.headers, { Accept: 'application/json' });
      assert.notProperty(calls[0]?.init ?? {}, 'body');
    });

    it('reads the spec fixture into what the pane draws', async () => {
      const { fetch } = fakeFetch(async () => jsonResponse(fixture()));
      const result = await fetchPriceRelay({ fetch });
      assert.deepEqual(result, {
        ok: true,
        reading: {
          priceUsd: '0.84114343',
          changePct24h: 36.72,
          sparklineUsd: [0.5259, 0.573, 0.6361, 0.6533, 0.7537, 0.8411],
          dexscreenerUrl: `https://dexscreener.com/base/${POOL}`,
          chain: 'base',
          dex: 'uniswap-v4',
          source: 'geckoterminal',
          generatedUnix: 1791223633,
          relayStale: false,
        },
      });
    });

    it('keeps the price but drops a pool link that is not DexScreener', () => {
      for (const url of [
        'https://evil.example/base/x',
        ['javascript', 'alert(1)'].join(':'),
        `http://dexscreener.com/base/${POOL}`,
        `https://dexscreener.com/base/0xf1e0…4599`,
        42,
      ]) {
        const document = fixture();
        document.pool = {
          ...(document.pool as object),
          dexscreener_url: url,
        };
        const reading = readingFromRelayDocument(document);
        assert.isNotNull(reading, String(url));
        assert.strictEqual(reading?.priceUsd, '0.84114343');
        assert.isNull(reading?.dexscreenerUrl, String(url));
      }
    });

    it('takes a minimal document: no change, no sparkline, no pool', () => {
      const reading = readingFromRelayDocument({
        schema: 'swarm-price/1',
        symbol: 'SWM',
        quote: 'USD',
        price_usd: '1.5',
        generated_unix: 1791223633,
        stale: true,
      });
      assert.deepEqual(reading, {
        priceUsd: '1.5',
        changePct24h: null,
        sparklineUsd: [],
        dexscreenerUrl: null,
        chain: null,
        dex: null,
        source: null,
        generatedUnix: 1791223633,
        relayStale: true,
      });
    });

    it('refuses the wrong schema, symbol, quote or price', () => {
      const cases: Array<[string, Record<string, unknown>]> = [
        ['schema', { schema: 'swarm-price/2' }],
        ['symbol', { symbol: 'ZEC' }],
        ['quote', { quote: 'EUR' }],
        ['price as a float', { price_usd: 0.84 }],
        ['zero price', { price_usd: '0' }],
        ['negative price', { price_usd: '-0.84' }],
        ['exponent', { price_usd: '8.4e-1' }],
        ['no price', { price_usd: undefined }],
        ['stale missing', { stale: undefined }],
        ['generated missing', { generated_unix: undefined }],
        ['sparkline of strings', { sparkline_usd: ['0.5', '0.6'] }],
        ['negative sparkline', { sparkline_usd: [0.5, -1] }],
        ['change as a string', { change_pct: { h24: '36.7' } }],
      ];
      for (const [name, change] of cases) {
        assert.isNull(
          readingFromRelayDocument({ ...fixture(), ...change }),
          name
        );
      }
      // The service's answer after an hour without a good read.
      assert.isNull(
        readingFromRelayDocument({
          schema: 'swarm-price/1',
          error: 'unavailable',
        })
      );
      assert.isNull(readingFromRelayDocument(null));
      assert.isNull(readingFromRelayDocument([fixture()]));
      assert.isNull(readingFromRelayDocument('0.84'));
    });

    it('calls malformed JSON not-json', async () => {
      const { fetch } = fakeFetch(async () =>
        jsonResponse('{"schema":"swarm-price/1", "price_usd": "0.8')
      );
      assert.deepEqual(await fetchPriceRelay({ fetch }), {
        ok: false,
        failure: 'not-json',
      });
    });

    it('calls a document of the wrong shape schema', async () => {
      const { fetch } = fakeFetch(async () =>
        jsonResponse({ ...fixture(), schema: 'other/1' })
      );
      assert.deepEqual(await fetchPriceRelay({ fetch }), {
        ok: false,
        failure: 'schema',
      });
    });

    it('refuses a body that is not declared JSON', async () => {
      const { fetch } = fakeFetch(async () =>
        jsonResponse(fixture(), { contentType: 'text/html' })
      );
      assert.deepEqual(await fetchPriceRelay({ fetch }), {
        ok: false,
        failure: 'not-json',
      });
    });

    it('calls any status but 200 http, the service 503 included', async () => {
      for (const status of [503, 404, 204, 302]) {
        const { fetch } = fakeFetch(async () =>
          status === 204
            ? new Response(null, { status })
            : jsonResponse(
                { schema: 'swarm-price/1', error: 'unavailable' },
                { status }
              )
        );
        // oxlint-disable-next-line no-await-in-loop
        assert.deepEqual(await fetchPriceRelay({ fetch }), {
          ok: false,
          failure: 'http',
        });
      }
    });

    it('stops reading past 64 KiB, declared or not', async () => {
      const big = JSON.stringify({
        ...fixture(),
        padding: 'x'.repeat(PRICE_MAX_BODY_BYTES),
      });
      const declared = fakeFetch(async () => jsonResponse(big));
      assert.deepEqual(await fetchPriceRelay({ fetch: declared.fetch }), {
        ok: false,
        failure: 'too-large',
      });

      // Streamed without a length, in 1 KiB pieces.
      const encoder = new TextEncoder();
      let sent = 0;
      const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
        pull(controller) {
          if (sent > 200) {
            controller.close();
            return;
          }
          sent += 1;
          controller.enqueue(encoder.encode('x'.repeat(1024)));
        },
      });
      const streamed = fakeFetch(
        async () =>
          new Response(stream, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
      );
      assert.deepEqual(await fetchPriceRelay({ fetch: streamed.fetch }), {
        ok: false,
        failure: 'too-large',
      });
      assert.isBelow(sent, 70, 'the read stopped at the cap');
    });

    it('gives up after the deadline', async () => {
      const { fetch } = fakeFetch(
        call =>
          new Promise<Response>((_resolve, reject) => {
            call.init.signal.addEventListener('abort', () =>
              reject(new Error('aborted'))
            );
          })
      );
      const started = Date.now();
      assert.deepEqual(await fetchPriceRelay({ fetch, timeoutMs: 30 }), {
        ok: false,
        failure: 'timeout',
      });
      assert.isBelow(Date.now() - started, 2_000);
    });

    it('calls a refused connection or a redirect network', async () => {
      const { fetch } = fakeFetch(async () => {
        throw new TypeError('fetch failed: redirect mode is set to error');
      });
      assert.deepEqual(await fetchPriceRelay({ fetch }), {
        ok: false,
        failure: 'network',
      });
    });
  });

  describe('the tracker', () => {
    let now: number;
    let enabled: boolean;
    let mainnet: boolean;
    let kept: unknown;
    let saves: number;
    let logs: Array<string>;
    let answer: () => Promise<Response>;
    let calls: Array<CallType>;

    function tracker(
      overrides: Partial<SwarmPriceTrackerOptionsType> = {}
    ): SwarmPriceTracker {
      const fake = fakeFetch(() => answer());
      calls = fake.calls;
      return new SwarmPriceTracker({
        fetch: fake.fetch,
        now: () => now,
        isEnabled: () => enabled,
        saveEnabled: value => {
          enabled = value;
        },
        isMainnet: () => mainnet,
        loadKept: () => kept,
        saveKept: value => {
          kept = JSON.parse(JSON.stringify(value));
          saves += 1;
        },
        log: message => logs.push(message),
        ...overrides,
      });
    }

    beforeEach(() => {
      now = 1_791_223_633_000;
      enabled = true;
      mainnet = true;
      kept = undefined;
      saves = 0;
      logs = [];
      answer = async () => jsonResponse(fixture());
    });

    it('waits, reads once, then is fresh and counts the seconds', async () => {
      const price = tracker();
      const first = price.get();
      assert.strictEqual(first.status, 'waiting');
      assert.isNull(first.reading);
      await price.whenIdle();
      assert.lengthOf(calls, 1);

      now += 12_000;
      const second = price.get();
      assert.strictEqual(second.status, 'fresh');
      assert.strictEqual(second.reading?.priceUsd, '0.84114343');
      assert.strictEqual(second.ageSeconds, 12);
      assert.strictEqual(second.fetchedAt, now - 12_000);
      assert.lengthOf(calls, 1, 'no second request inside the minute');
    });

    it('asks at most once a minute, however often the pane polls', async () => {
      const price = tracker();
      for (let second = 0; second < 5 * 60; second += 3) {
        price.get();
        // oxlint-disable-next-line no-await-in-loop
        await price.whenIdle();
        now += 3_000;
      }
      // 0, 60, 120, 180, 240 s.
      assert.lengthOf(calls, 5);
      assert.strictEqual(PRICE_FETCH_EVERY_MS, MINUTE);
    });

    it('asks nothing while nobody asks', async () => {
      const price = tracker();
      price.get();
      await price.whenIdle();
      now += 60 * MINUTE;
      assert.lengthOf(calls, 1);
      // state() is what the pane is told; it starts nothing.
      assert.strictEqual(price.state().status, 'unavailable');
      assert.lengthOf(calls, 1);
      price.get();
      await price.whenIdle();
      assert.lengthOf(calls, 2, 'the pane is back: read at once');
      assert.strictEqual(price.state().status, 'fresh');
    });

    it('asks nothing and shows nothing while the switch is off', async () => {
      enabled = false;
      const price = tracker();
      const state = price.get();
      await price.whenIdle();
      assert.strictEqual(state.status, 'off');
      assert.isFalse(state.enabled);
      assert.isNull(state.reading);
      assert.lengthOf(calls, 0);

      const on = price.setEnabled(true);
      await price.whenIdle();
      assert.isTrue(on.enabled);
      assert.lengthOf(calls, 1, 'switched on: read at once');
      assert.strictEqual(price.get().status, 'fresh');

      price.setEnabled(false);
      assert.isFalse(enabled);
      now += 10 * MINUTE;
      assert.strictEqual(price.get().status, 'off');
      await price.whenIdle();
      assert.lengthOf(calls, 1);
    });

    it('asks nothing off SWARM Mainnet, not even with the switch on', async () => {
      mainnet = false;
      const price = tracker();
      const state = price.get();
      await price.whenIdle();
      assert.strictEqual(state.status, 'not-mainnet');
      assert.isNull(state.reading);
      assert.lengthOf(calls, 0);
      enabled = false;
      assert.strictEqual(price.get().status, 'not-mainnet');
    });

    it('keeps the last good reading through failures, then ages it', async () => {
      const price = tracker();
      price.get();
      await price.whenIdle();

      const failures: Array<() => Promise<Response>> = [
        async () => jsonResponse('{oops'),
        async () => jsonResponse({ ...fixture(), schema: 'x' }),
        async () => jsonResponse({ error: 'unavailable' }, { status: 503 }),
        async () => {
          throw new Error('offline');
        },
      ];
      for (const failure of failures) {
        answer = failure;
        now += MINUTE;
        price.get();
        // oxlint-disable-next-line no-await-in-loop
        await price.whenIdle();
      }
      assert.lengthOf(calls, 5);
      // Four minutes after the good read: still fresh, still that price.
      let state = price.get();
      assert.strictEqual(state.status, 'fresh');
      assert.strictEqual(state.reading?.priceUsd, '0.84114343');

      now += 2 * MINUTE;
      state = price.state();
      assert.strictEqual(state.status, 'ageing');
      assert.strictEqual(state.reading?.priceUsd, '0.84114343');

      now += 25 * MINUTE;
      assert.strictEqual(price.state().status, 'stale');
      now += 30 * MINUTE;
      state = price.state();
      assert.strictEqual(state.status, 'unavailable');
      assert.isNull(state.reading);

      // Categories only, each said once, never a price or an address.
      assert.deepEqual(logs, [
        'price: read the SWM price',
        'price: the price service gave nothing usable (not-json); keeping the last reading',
        'price: the price service gave nothing usable (schema); keeping the last reading',
        'price: the price service gave nothing usable (http); keeping the last reading',
        'price: the price service gave nothing usable (network); keeping the last reading',
      ]);
    });

    it('shows the service’s own stale flag as stale', async () => {
      answer = async () => jsonResponse({ ...fixture(), stale: true });
      const price = tracker();
      price.get();
      await price.whenIdle();
      assert.strictEqual(price.get().status, 'stale');
    });

    it('keeps the reading on disk, at most every ten minutes', async () => {
      const price = tracker();
      for (let minute = 0; minute < 25; minute += 1) {
        price.get();
        // oxlint-disable-next-line no-await-in-loop
        await price.whenIdle();
        now += MINUTE;
      }
      assert.lengthOf(calls, 25);
      assert.strictEqual(saves, 3, 'at 0, 10 and 20 minutes');
      assert.deepEqual(Object.keys(kept as object).sort(), [
        'fetchedAt',
        'reading',
      ]);
    });

    it('shows a kept reading greyed until the first read of this run', async () => {
      kept = {
        reading: readingFromRelayDocument(fixture()),
        fetchedAt: now - 1_000,
      };
      answer = async () => jsonResponse('{oops');
      const price = tracker();
      const state = price.get();
      assert.strictEqual(state.status, 'ageing', 'never fresh from disk');
      assert.strictEqual(state.reading?.priceUsd, '0.84114343');
      await price.whenIdle();
      assert.strictEqual(price.state().status, 'ageing');

      answer = async () => jsonResponse(fixture());
      now += MINUTE;
      price.get();
      await price.whenIdle();
      assert.strictEqual(price.state().status, 'fresh');
    });

    it('ignores a kept reading it cannot read', () => {
      for (const bad of [
        'x',
        42,
        { reading: { priceUsd: 'free' }, fetchedAt: now },
        { reading: readingFromRelayDocument(fixture()), fetchedAt: -1 },
        { reading: readingFromRelayDocument(fixture()) },
      ]) {
        kept = bad;
        assert.strictEqual(tracker().state().status, 'waiting');
      }
      assert.strictEqual(
        tracker({
          loadKept: () => {
            throw new Error('unreadable config');
          },
        }).state().status,
        'waiting'
      );
    });

    it('drops an answer that arrives after the switch went off', async () => {
      let release: (() => void) | undefined;
      answer = () =>
        new Promise<Response>(resolve => {
          release = () => resolve(jsonResponse(fixture()));
        });
      const price = tracker();
      price.get();
      enabled = false;
      release?.();
      await price.whenIdle();
      enabled = true;
      assert.strictEqual(price.state().status, 'waiting');
    });
  });
});
