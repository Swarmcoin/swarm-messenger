// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (PD-5, 2026-10-05): the SWM price on the screen.
//
// The price arrives as a decimal string ("0.84114343") and stays one: the value
// of a balance is worked out in bigint from the zatoshi count and the price's
// digits, rounded half-up to the cent once, at the end. Nothing here passes a
// balance through a float. (The sparkline is drawn from floats: it is a
// picture, not an amount.)
//
// Freshness follows specs/PRICE-DISPLAY.md section 2.2: fresh under 5 minutes,
// ageing 5 to 30 minutes ("as of hh:mm"), stale over 30 minutes or when the
// price service says so (greyed), unavailable after 60 minutes.

import { ZATOSHI_PER_SWM } from './swmAmount.std.ts';

/** Decimals a price is held to: 18, more than the service ever sends. */
export const PRICE_DECIMALS = 18;
const PRICE_SCALE = 10n ** BigInt(PRICE_DECIMALS);

export const PRICE_FRESH_FOR_MS = 5 * 60 * 1000;
export const PRICE_AGEING_UNTIL_MS = 30 * 60 * 1000;
export const PRICE_UNAVAILABLE_AFTER_MS = 60 * 60 * 1000;

/**
 * A decimal price string as an integer count of 10^-18 USD, or null when it
 * is not a plain positive decimal (no sign, no exponent, at most 18 decimals).
 */
export function priceUnitsFromDecimal(text: string): bigint | null {
  const match = /^(0|[1-9][0-9]{0,11})(?:\.([0-9]{1,18}))?$/.exec(text);
  if (match == null) {
    return null;
  }
  const whole = BigInt(match[1] ?? '0');
  const fraction = BigInt((match[2] ?? '').padEnd(PRICE_DECIMALS, '0'));
  const units = whole * PRICE_SCALE + fraction;
  return units > 0n ? units : null;
}

/**
 * What `zatoshi` is worth at `priceUsd`, in US cents, rounded half-up. Null
 * when the price is not a price. A display, not an accounting value.
 *
 *   cents = zatoshi * units / (10^8 * 10^18 / 100)
 */
export function fiatCentsForZatoshi(
  zatoshi: bigint,
  priceUsd: string
): bigint | null {
  const units = priceUnitsFromDecimal(priceUsd);
  if (units == null || zatoshi < 0n) {
    return null;
  }
  const divisor = (ZATOSHI_PER_SWM * PRICE_SCALE) / 100n;
  return (zatoshi * units + divisor / 2n) / divisor;
}

function groupThousands(whole: bigint): string {
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 936410n cents is "9,364.10". */
export function formatUsdCents(cents: bigint): string {
  const magnitude = cents < 0n ? -cents : cents;
  const whole = groupThousands(magnitude / 100n);
  const fraction = (magnitude % 100n).toString().padStart(2, '0');
  return `${cents < 0n ? '-' : ''}${whole}.${fraction}`;
}

/**
 * The price as the price card shows it: two decimals at 1 USD and above
 * ("12.35", "1,234.50"), otherwise four significant digits ("0.8411",
 * "0.001235"). Rounded half-up on the decimal digits; null for a non-price.
 */
export function formatUsdPrice(priceUsd: string): string | null {
  return formatDecimalPrice(priceUsd, 4);
}

/**
 * A decimal price with `significant` significant digits below 1, two
 * decimals from 1 up ("0.000196" for an ETH price with three). Half-up.
 */
export function formatDecimalPrice(
  price: string,
  significant: number
): string | null {
  const units = priceUnitsFromDecimal(price);
  if (units == null) {
    return null;
  }
  if (units >= PRICE_SCALE) {
    return formatUsdCents(roundToDecimals(units, 2));
  }
  const digits = units.toString().padStart(PRICE_DECIMALS, '0');
  const firstSignificant = digits.search(/[1-9]/);
  let decimals = Math.min(firstSignificant + significant, PRICE_DECIMALS);
  let rounded = roundToDecimals(units, decimals);
  if (rounded >= 10n ** BigInt(decimals)) {
    // 0.99996 rounds to 1: shown the way 1 and more is shown.
    return formatUsdCents(roundToDecimals(units, 2));
  }
  if (rounded.toString().length > significant && decimals > 1) {
    // 0.0099996 rounds up into the next decade: keep the digit count.
    rounded /= 10n;
    decimals -= 1;
  }
  return `0.${rounded.toString().padStart(decimals, '0')}`;
}

/** `units` (10^-18) rounded half-up to `decimals` decimals, as an integer. */
function roundToDecimals(units: bigint, decimals: number): bigint {
  if (decimals >= PRICE_DECIMALS) {
    return units;
  }
  const step = 10n ** BigInt(PRICE_DECIMALS - decimals);
  return (units + step / 2n) / step;
}

export type PriceChangeType = Readonly<{
  direction: 'up' | 'down' | 'flat';
  /** The magnitude with one decimal, e.g. "36.7". */
  text: string;
}>;

/** A change in percent as the chip shows it: one decimal, no sign. */
export function formatPriceChange(percent: number): PriceChangeType {
  const tenths = Math.round(Math.abs(percent) * 10);
  const text = (tenths / 10).toFixed(1);
  if (tenths === 0) {
    return { direction: 'flat', text };
  }
  return { direction: percent > 0 ? 'up' : 'down', text };
}

export type PriceFreshnessType = 'fresh' | 'ageing' | 'stale' | 'unavailable';

/**
 * How old a reading is, in the spec's four words. `fromDisk`: the reading was
 * kept from an earlier run and nothing has been read since, so it is never
 * shown as fresh.
 */
export function classifyPriceFreshness({
  ageMs,
  relayStale,
  fromDisk,
}: {
  ageMs: number;
  relayStale: boolean;
  fromDisk: boolean;
}): PriceFreshnessType {
  const age = Math.max(0, ageMs);
  if (age >= PRICE_UNAVAILABLE_AFTER_MS) {
    return 'unavailable';
  }
  if (age > PRICE_AGEING_UNTIL_MS || relayStale) {
    return 'stale';
  }
  if (age >= PRICE_FRESH_FOR_MS || fromDisk) {
    return 'ageing';
  }
  return 'fresh';
}

const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  base: 'Base',
  'uniswap-v4': 'Uniswap v4',
  'uniswap-v3': 'Uniswap v3',
  geckoterminal: 'GeckoTerminal',
  dexscreener: 'DexScreener',
};

/**
 * The names in the price card's meta line ("Base · Uniswap v4 ·
 * GeckoTerminal"). Proper names, not translated; an id this app does not know
 * is left out rather than shown raw.
 */
export function priceSourceNames(
  ids: ReadonlyArray<string | null>
): Array<string> {
  const names: Array<string> = [];
  for (const id of ids) {
    const name = id == null ? undefined : DISPLAY_NAMES[id];
    if (name != null) {
      names.push(name);
    }
  }
  return names;
}

export type SparklinePathsType = Readonly<{ line: string; area: string }>;

/**
 * SVG path data for a sparkline of `values` in a `width` x `height` box, no
 * axes. Null with fewer than two points. A flat series is drawn mid-height.
 */
export function sparklinePaths(
  values: ReadonlyArray<number>,
  width: number,
  height: number
): SparklinePathsType | null {
  if (values.length < 2) {
    return null;
  }
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = width / (values.length - 1);
  const round = (n: number) => Math.round(n * 100) / 100;
  const points = values.map((value, index) => {
    const ratio = span === 0 ? 0.5 : (value - min) / span;
    const x = round(index * step);
    const y = round(pad + (1 - ratio) * (height - 2 * pad));
    return `${x},${y}`;
  });
  const line = `M${points.join(' L')}`;
  const area = `${line} L${round(width)},${height} L0,${height} Z`;
  return { line, area };
}

// The price page (PD-5b) ------------------------------------------------------

/**
 * A market figure in USD for the page's stats ("3,761" from 1 000 up, "378.11"
 * below). From the service's numbers: a display, not an amount anyone holds.
 */
export function formatUsdStat(value: number): string {
  const cents = BigInt(Math.round(Math.max(0, value) * 100));
  if (cents >= 100_000n) {
    return groupThousands((cents + 50n) / 100n);
  }
  return formatUsdCents(cents);
}

/** "0xf1e0…4599": the first six and the last four characters. */
export function shortenHex(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export const PRICE_CHART_RANGES = ['24h', '48h', '30d'] as const;
export type PriceChartRangeType = (typeof PRICE_CHART_RANGES)[number];

export type PriceChartSeriesType = Readonly<{
  values: ReadonlyArray<number>;
  /** The time of the first value, Unix seconds, or null when not known. */
  fromUnix: number | null;
  stepSeconds: number;
}>;

/**
 * What a range of the page's chart draws: `24h` the last 24 hourly closes,
 * `48h` all of them, `30d` the daily closes. Null when the range has fewer
 * than two points (its button is then disabled).
 */
export function priceChartSeries(
  reading: Readonly<{
    sparklineUsd: ReadonlyArray<number>;
    hourlyFromUnix: number | null;
    dailyUsd: ReadonlyArray<number>;
    dailyFromUnix: number | null;
  }>,
  range: PriceChartRangeType
): PriceChartSeriesType | null {
  let series: PriceChartSeriesType;
  if (range === '30d') {
    series = {
      values: reading.dailyUsd,
      fromUnix: reading.dailyFromUnix,
      stepSeconds: 24 * 3600,
    };
  } else {
    const hourly = reading.sparklineUsd;
    const skip = range === '24h' ? Math.max(0, hourly.length - 24) : 0;
    series = {
      values: hourly.slice(skip),
      fromUnix:
        reading.hourlyFromUnix == null
          ? null
          : reading.hourlyFromUnix + skip * 3600,
      stepSeconds: 3600,
    };
  }
  return series.values.length >= 2 ? series : null;
}

export type PriceChartPointType = Readonly<{ x: number; y: number }>;

export type PriceChartGeometryType = Readonly<{
  points: ReadonlyArray<PriceChartPointType>;
  line: string;
  area: string;
  minIndex: number;
  maxIndex: number;
}>;

/**
 * Where each value sits in a plot `width` wide from x = 0 and between
 * `top` and `bottom`; the line and the area under it down to `bottom`.
 */
export function priceChartGeometry(
  values: ReadonlyArray<number>,
  { width, top, bottom }: { width: number; top: number; bottom: number }
): PriceChartGeometryType | null {
  if (values.length < 2) {
    return null;
  }
  let minIndex = 0;
  let maxIndex = 0;
  values.forEach((value, index) => {
    if (value < (values[minIndex] ?? value)) {
      minIndex = index;
    }
    if (value > (values[maxIndex] ?? value)) {
      maxIndex = index;
    }
  });
  const min = values[minIndex] ?? 0;
  const span = (values[maxIndex] ?? 0) - min;
  const step = width / (values.length - 1);
  const round = (n: number) => Math.round(n * 100) / 100;
  const points = values.map((value, index) => ({
    x: round(index * step),
    y: round(
      span === 0
        ? (top + bottom) / 2
        : top + (1 - (value - min) / span) * (bottom - top)
    ),
  }));
  const line = `M${points.map(({ x, y }) => `${x},${y}`).join(' L')}`;
  const area = `${line} L${round(width)},${bottom} L0,${bottom} Z`;
  return { points, line, area, minIndex, maxIndex };
}

/** The value nearest to `x` in a plot `width` wide with `count` values. */
export function priceChartIndexAt(
  x: number,
  width: number,
  count: number
): number {
  if (count < 2 || width <= 0) {
    return 0;
  }
  const index = Math.round((x / width) * (count - 1));
  return Math.min(count - 1, Math.max(0, index));
}
