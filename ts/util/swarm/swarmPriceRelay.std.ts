// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (PD-5, 2026-10-05): the main process's side of the SWM price.
//
// One unauthenticated GET to the SWARM price service, at most once a minute,
// and only while the Wallet pane is asking (it asks every few seconds while it
// is on screen). Nothing about the wallet goes with it: no address, no
// balance, no identifier. The URL is fixed here; nothing the renderer sends
// can change it. The answer is held to specs/PRICE-DISPLAY.md section 2.1:
// 8 s deadline, no redirects, at most 64 KiB, strict JSON, the
// `swarm-price/1` schema. Anything else is a failed read, and the last good
// reading stays.
//
// Pure apart from what is injected (fetch, clock, storage, settings), so the
// tests drive it without Electron.

import {
  SwarmPriceReadingSchema,
  SwarmPriceRelaySchema,
} from '../../types/SwarmWallet.std.ts';
import type {
  SwarmPriceReadingType,
  SwarmPriceStateType,
} from '../../types/SwarmWallet.std.ts';
import { classifyPriceFreshness } from './swarmPrice.std.ts';

/** The one place the price comes from (spec section 2.2: fixed in the app). */
export const SWARM_PRICE_RELAY_URL = 'https://wallet.swarm.green/api/price/swm';

export const PRICE_FETCH_TIMEOUT_MS = 8_000;
export const PRICE_MAX_BODY_BYTES = 64 * 1024;
/** At most one request per this long, success or not. */
export const PRICE_FETCH_EVERY_MS = 60_000;
/** The kept reading is written to disk at most this often. */
export const PRICE_SAVE_EVERY_MS = 10 * 60 * 1000;

export type PriceFetchType = (
  url: string,
  init: {
    method: 'GET';
    redirect: 'error';
    signal: AbortSignal;
    headers: Record<string, string>;
    cache: 'no-store';
    credentials: 'omit';
  }
) => Promise<Response>;

export type PriceFailureType =
  | 'network'
  | 'timeout'
  | 'http'
  | 'not-json'
  | 'too-large'
  | 'schema';

export type PriceFetchResultType =
  | Readonly<{ ok: true; reading: SwarmPriceReadingType }>
  | Readonly<{ ok: false; failure: PriceFailureType }>;

/** The service's document, reduced to what the pane draws. */
export function readingFromRelayDocument(
  document: unknown
): SwarmPriceReadingType | null {
  const parsed = SwarmPriceRelaySchema.safeParse(document);
  if (!parsed.success) {
    return null;
  }
  const relay = parsed.data;
  return {
    priceUsd: relay.price_usd,
    changePct24h: relay.change_pct?.h24 ?? null,
    sparklineUsd: relay.sparkline_usd ?? [],
    dexscreenerUrl: relay.pool?.dexscreener_url ?? null,
    chain: relay.pool?.chain ?? null,
    dex: relay.pool?.dex ?? null,
    source: relay.source ?? null,
    generatedUnix: relay.generated_unix,
    relayStale: relay.stale,
  };
}

/** Lets the rest of a response go, without caring how that ends. */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Nothing to do: the answer is already refused.
  }
}

async function readCappedBody(
  response: Response,
  maxBytes: number
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discardBody(response);
    return null;
  }
  if (response.body == null) {
    const whole = new Uint8Array(await response.arrayBuffer());
    return whole.byteLength > maxBytes ? null : whole;
  }
  const reader = response.body.getReader();
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let total = 0;
  let tooLarge = false;
  for (;;) {
    // One chunk at a time is the point: the count stops the read at the cap.
    // oxlint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      tooLarge = true;
      break;
    }
    chunks.push(value);
  }
  if (tooLarge) {
    try {
      await reader.cancel();
    } catch {
      // Refused either way.
    }
    return null;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * One read of the price service. Never throws: a failure is a category,
 * which is all that is logged.
 */
export async function fetchPriceRelay({
  fetch,
  url = SWARM_PRICE_RELAY_URL,
  timeoutMs = PRICE_FETCH_TIMEOUT_MS,
  maxBytes = PRICE_MAX_BODY_BYTES,
}: {
  fetch: PriceFetchType;
  url?: string;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<PriceFetchResultType> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch {
      return { ok: false, failure: timedOut ? 'timeout' : 'network' };
    }
    if (response.status !== 200) {
      await discardBody(response);
      return { ok: false, failure: 'http' };
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!/^application\/json(\s*;|$)/i.test(contentType.trim())) {
      await discardBody(response);
      return { ok: false, failure: 'not-json' };
    }
    let body: Uint8Array<ArrayBuffer> | null;
    try {
      body = await readCappedBody(response, maxBytes);
    } catch {
      return { ok: false, failure: timedOut ? 'timeout' : 'network' };
    }
    if (body == null) {
      return { ok: false, failure: 'too-large' };
    }
    let document: unknown;
    try {
      document = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(body)
      );
    } catch {
      return { ok: false, failure: 'not-json' };
    }
    const reading = readingFromRelayDocument(document);
    if (reading == null) {
      return { ok: false, failure: 'schema' };
    }
    return { ok: true, reading };
  } finally {
    clearTimeout(timer);
  }
}

/** What is kept on disk: the last good reading and when it was received. */
type KeptReadingType = Readonly<{
  reading: SwarmPriceReadingType;
  fetchedAt: number;
}>;

function keptReadingFrom(value: unknown): KeptReadingType | null {
  if (value == null || typeof value !== 'object') {
    return null;
  }
  const { reading, fetchedAt } = value as Record<string, unknown>;
  const parsed = SwarmPriceReadingSchema.safeParse(reading);
  if (
    !parsed.success ||
    typeof fetchedAt !== 'number' ||
    !Number.isSafeInteger(fetchedAt) ||
    fetchedAt < 0
  ) {
    return null;
  }
  return { reading: parsed.data, fetchedAt };
}

export type SwarmPriceTrackerOptionsType = Readonly<{
  fetch: PriceFetchType;
  now: () => number;
  /** "Show SWM price (USD)"; default on. */
  isEnabled: () => boolean;
  saveEnabled: (enabled: boolean) => void;
  /** Whether the wallet is on SWARM Mainnet. Test coins get no price. */
  isMainnet: () => boolean;
  /** The last good reading, as `save` wrote it (or anything else: ignored). */
  loadKept: () => unknown;
  saveKept: (kept: unknown) => void;
  /** Categories only. */
  log: (message: string) => void;
}>;

/**
 * The price as the main process keeps it. `get()` is what the pane's poll
 * calls: it answers at once from memory and, when a minute has passed since
 * the last request, starts the next one in the background. No poll, no
 * request: when the Wallet pane is closed, the price service hears nothing.
 */
export class SwarmPriceTracker {
  readonly #options: SwarmPriceTrackerOptionsType;

  #kept: KeptReadingType | null;

  /** True until a read in this run succeeds. */
  #fromDisk: boolean;

  #lastAttemptAt: number | null = null;

  #lastSavedAt: number | null = null;

  #lastFailure: PriceFailureType | null = null;

  #inFlight: Promise<void> | null = null;

  constructor(options: SwarmPriceTrackerOptionsType) {
    this.#options = options;
    let kept: KeptReadingType | null = null;
    try {
      kept = keptReadingFrom(options.loadKept());
    } catch {
      kept = null;
    }
    this.#kept = kept;
    this.#fromDisk = kept != null;
  }

  /** The pane asked: answer now, and read the service if it is time to. */
  get(): SwarmPriceStateType {
    if (this.#shouldFetch()) {
      this.#startFetch();
    }
    return this.state();
  }

  /** The switch. Turning it on reads the service at the next ask. */
  setEnabled(enabled: boolean): SwarmPriceStateType {
    this.#options.saveEnabled(enabled);
    this.#options.log(`price: display switched ${enabled ? 'on' : 'off'}`);
    if (enabled) {
      this.#lastAttemptAt = null;
    }
    return this.get();
  }

  /** Resolves when no request is running (for tests and shutdown). */
  async whenIdle(): Promise<void> {
    await this.#inFlight;
  }

  /** The answer for the pane, without starting anything. */
  state(): SwarmPriceStateType {
    const enabled = this.#options.isEnabled();
    const empty = { reading: null, fetchedAt: null, ageSeconds: null };
    // Test coins have no price: not even the switch is shown there.
    if (!this.#options.isMainnet()) {
      return { status: 'not-mainnet', enabled, ...empty };
    }
    if (!enabled) {
      return { status: 'off', enabled, ...empty };
    }
    const kept = this.#kept;
    if (kept == null) {
      return { status: 'waiting', enabled, ...empty };
    }
    const ageMs = Math.max(0, this.#options.now() - kept.fetchedAt);
    const status = classifyPriceFreshness({
      ageMs,
      relayStale: kept.reading.relayStale,
      fromDisk: this.#fromDisk,
    });
    if (status === 'unavailable') {
      return { status, enabled, ...empty };
    }
    return {
      status,
      enabled,
      reading: kept.reading,
      fetchedAt: kept.fetchedAt,
      ageSeconds: Math.floor(ageMs / 1000),
    };
  }

  #shouldFetch(): boolean {
    if (this.#inFlight != null) {
      return false;
    }
    if (!this.#options.isEnabled() || !this.#options.isMainnet()) {
      return false;
    }
    return (
      this.#lastAttemptAt == null ||
      this.#options.now() - this.#lastAttemptAt >= PRICE_FETCH_EVERY_MS
    );
  }

  #startFetch(): void {
    this.#lastAttemptAt = this.#options.now();
    this.#inFlight = (async () => {
      try {
        await this.#fetchOnce();
      } catch {
        this.#options.log('price: the read failed unexpectedly');
      } finally {
        this.#inFlight = null;
      }
    })();
  }

  async #fetchOnce(): Promise<void> {
    const result = await fetchPriceRelay({ fetch: this.#options.fetch });
    // The switch or the network may have changed while it was on the way.
    if (!this.#options.isEnabled() || !this.#options.isMainnet()) {
      return;
    }
    if (!result.ok) {
      if (result.failure !== this.#lastFailure) {
        this.#options.log(
          `price: the price service gave nothing usable (${result.failure}); keeping the last reading`
        );
      }
      this.#lastFailure = result.failure;
      return;
    }
    if (this.#lastFailure != null || this.#kept == null) {
      this.#options.log('price: read the SWM price');
    }
    this.#lastFailure = null;
    const fetchedAt = this.#options.now();
    this.#kept = { reading: result.reading, fetchedAt };
    this.#fromDisk = false;
    if (
      this.#lastSavedAt == null ||
      fetchedAt - this.#lastSavedAt >= PRICE_SAVE_EVERY_MS
    ) {
      this.#lastSavedAt = fetchedAt;
      try {
        this.#options.saveKept(this.#kept);
      } catch {
        this.#options.log('price: could not keep the reading on disk');
      }
    }
  }
}
