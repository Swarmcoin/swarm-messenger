// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (PD-5, 2026-10-05): the SWM price on the screen. What must
// hold: the value of a balance is exact (bigint from zatoshi and the price's
// digits, half-up to the cent once), the price shows two decimals from 1 USD
// and four significant digits below, the change is a plain one-decimal
// figure, the freshness words follow the spec's minutes, and only a
// DexScreener pool page is ever a link.

import { assert } from 'chai';

import {
  classifyPriceFreshness,
  formatDecimalPrice,
  formatUsdStat,
  priceChartGeometry,
  priceChartIndexAt,
  priceChartSeries,
  shortenHex,
  fiatCentsForZatoshi,
  formatPriceChange,
  formatUsdCents,
  formatUsdPrice,
  priceSourceNames,
  priceUnitsFromDecimal,
  sparklinePaths,
} from '../../util/swarm/swarmPrice.std.ts';
import {
  DecimalPriceSchema,
  isDexscreenerPoolUrl,
  isGeckoterminalPoolUrl,
} from '../../types/SwarmWallet.std.ts';

const POOL =
  '0xf1e066d77279b388b40fdca7f5cf4a6559f77bdf9e2e8937ce9c2fe2960f4599';
const MINUTE = 60 * 1000;

describe('SWARM price: amounts and words (PD-5)', () => {
  describe('the price as a decimal', () => {
    it('reads plain positive decimals exactly', () => {
      assert.strictEqual(
        priceUnitsFromDecimal('0.84114343'),
        841_143_430_000_000_000n
      );
      assert.strictEqual(
        priceUnitsFromDecimal('1'),
        1_000_000_000_000_000_000n
      );
      assert.strictEqual(priceUnitsFromDecimal('0.000000000000000001'), 1n);
    });

    it('refuses everything that is not one', () => {
      for (const bad of [
        '0',
        '0.0',
        '-1',
        '+1',
        '1e3',
        '1,5',
        ' 1',
        '01',
        '.5',
        '1.',
        '0.0000000000000000001',
        '1234567890123',
        'NaN',
        '',
      ]) {
        assert.isNull(priceUnitsFromDecimal(bad), bad);
        assert.isFalse(DecimalPriceSchema.safeParse(bad).success, bad);
      }
      assert.isTrue(DecimalPriceSchema.safeParse('0.84114343').success);
    });
  });

  describe('what a balance is worth', () => {
    it('is the spec example: 11 132.58 SWM at 0.84114343 is $9,364.10', () => {
      const cents = fiatCentsForZatoshi(1_113_258_000_000n, '0.84114343');
      assert.strictEqual(cents, 936_410n);
      assert.strictEqual(formatUsdCents(cents ?? 0n), '9,364.10');
    });

    it('is the send example: 223.03 SWM is $187.60', () => {
      assert.strictEqual(
        fiatCentsForZatoshi(22_303_000_000n, '0.84114343'),
        18_760n
      );
    });

    it('rounds half up, once, at the cent', () => {
      // 1.01 SWM at 0.5 USD is 0.505 USD exactly.
      assert.strictEqual(fiatCentsForZatoshi(101_000_000n, '0.5'), 51n);
      // 1.00999999 SWM at 0.5 is 0.504999995: down.
      assert.strictEqual(fiatCentsForZatoshi(100_999_999n, '0.5'), 50n);
      assert.strictEqual(fiatCentsForZatoshi(0n, '0.84114343'), 0n);
      assert.strictEqual(fiatCentsForZatoshi(1n, '0.84114343'), 0n);
    });

    it('stays exact where a float would not', () => {
      // The whole supply at a twelve-digit price with eighteen decimals.
      const cents = fiatCentsForZatoshi(
        21_000_000n * 100_000_000n,
        '123456789012.123456789012345678'
      );
      assert.strictEqual(cents, 259_259_256_925_459_259_257n);
      assert.strictEqual(
        formatUsdCents(cents ?? 0n),
        '2,592,592,569,254,592,592.57'
      );
    });

    it('has no value without a price', () => {
      assert.isNull(fiatCentsForZatoshi(100n, 'abc'));
      assert.isNull(fiatCentsForZatoshi(-1n, '1'));
    });
  });

  describe('the price as the card shows it', () => {
    it('shows four significant digits under 1 USD', () => {
      assert.strictEqual(formatUsdPrice('0.84114343'), '0.8411');
      assert.strictEqual(formatUsdPrice('0.86025'), '0.8603');
      assert.strictEqual(formatUsdPrice('0.0012345'), '0.001235');
      assert.strictEqual(formatUsdPrice('0.5'), '0.5000');
      assert.strictEqual(formatUsdPrice('0.0099996'), '0.01000');
    });

    it('shows two decimals from 1 USD up', () => {
      assert.strictEqual(formatUsdPrice('1'), '1.00');
      assert.strictEqual(formatUsdPrice('12.345'), '12.35');
      assert.strictEqual(formatUsdPrice('1234.5'), '1,234.50');
      // Rounds up to 1: shown the way 1 USD is.
      assert.strictEqual(formatUsdPrice('0.99996'), '1.00');
    });

    it('shows nothing for a non-price', () => {
      assert.isNull(formatUsdPrice('0'));
      assert.isNull(formatUsdPrice('1e2'));
    });
  });

  it('says a change as one decimal and a direction', () => {
    assert.deepEqual(formatPriceChange(36.72), {
      direction: 'up',
      text: '36.7',
    });
    assert.deepEqual(formatPriceChange(-3.24), {
      direction: 'down',
      text: '3.2',
    });
    assert.deepEqual(formatPriceChange(0), { direction: 'flat', text: '0.0' });
    assert.deepEqual(formatPriceChange(-0.04), {
      direction: 'flat',
      text: '0.0',
    });
  });

  describe('freshness', () => {
    const at = (
      ageMs: number,
      extra: Partial<{ relayStale: boolean; fromDisk: boolean }> = {}
    ) =>
      classifyPriceFreshness({
        ageMs,
        relayStale: false,
        fromDisk: false,
        ...extra,
      });

    it('follows the spec: 5, 30 and 60 minutes', () => {
      assert.strictEqual(at(0), 'fresh');
      assert.strictEqual(at(5 * MINUTE - 1), 'fresh');
      assert.strictEqual(at(5 * MINUTE), 'ageing');
      assert.strictEqual(at(30 * MINUTE), 'ageing');
      assert.strictEqual(at(30 * MINUTE + 1), 'stale');
      assert.strictEqual(at(60 * MINUTE - 1), 'stale');
      assert.strictEqual(at(60 * MINUTE), 'unavailable');
    });

    it('greys a reading the service calls stale, or one kept from before', () => {
      assert.strictEqual(at(1000, { relayStale: true }), 'stale');
      assert.strictEqual(at(1000, { fromDisk: true }), 'ageing');
      assert.strictEqual(at(61 * MINUTE, { fromDisk: true }), 'unavailable');
    });

    it('treats a clock that went back as no time at all', () => {
      assert.strictEqual(at(-5 * MINUTE), 'fresh');
    });
  });

  it('names the sources it knows, and leaves out the rest', () => {
    assert.deepEqual(
      priceSourceNames(['base', 'uniswap-v4', 'geckoterminal']),
      ['Base', 'Uniswap v4', 'GeckoTerminal']
    );
    assert.deepEqual(priceSourceNames([null, 'dexscreener', 'some-dex']), [
      'DexScreener',
    ]);
  });

  it('draws a sparkline in its box, and none from one point', () => {
    const paths = sparklinePaths([1, 2, 3], 100, 20);
    assert.isNotNull(paths);
    assert.strictEqual(paths?.line, 'M0,18 L50,10 L100,2');
    assert.strictEqual(paths?.area, 'M0,18 L50,10 L100,2 L100,20 L0,20 Z');
    assert.strictEqual(
      sparklinePaths([5, 5], 10, 20)?.line,
      'M0,10 L10,10',
      'a flat series is drawn mid-height'
    );
    assert.isNull(sparklinePaths([1], 100, 20));
    assert.isNull(sparklinePaths([], 100, 20));
  });

  describe('the pool link', () => {
    it('is a DexScreener pool page', () => {
      assert.isTrue(
        isDexscreenerPoolUrl(`https://dexscreener.com/base/${POOL}`)
      );
    });

    it('is nothing else', () => {
      for (const bad of [
        `http://dexscreener.com/base/${POOL}`,
        `https://www.dexscreener.com/base/${POOL}`,
        `https://dexscreener.com.evil.example/base/${POOL}`,
        `https://evil.example/https://dexscreener.com/base/${POOL}`,
        `https://user@dexscreener.com/base/${POOL}`,
        `https://dexscreener.com:8443/base/${POOL}`,
        `https://dexscreener.com/base/${POOL}?ref=x`,
        `https://dexscreener.com/base/${POOL}#x`,
        `https://dexscreener.com/base/0xf1e0…4599`,
        'https://dexscreener.com/',
        // A script URL, spelled so that it is not one in this file.
        ['javascript', 'alert(1)'].join(':'),
        `file:///dexscreener.com/base/${POOL}`,
        `https://dexscreener.com/base/${'a'.repeat(300)}`,
        'not a url',
      ]) {
        assert.isFalse(isDexscreenerPoolUrl(bad), bad);
      }
    });
  });

  // SWARM addition (PD-5b): the price page. ---------------------------------

  describe('the price page', () => {
    it('writes the ETH price with three significant digits', () => {
      assert.strictEqual(
        formatDecimalPrice('0.000195976178807639', 3),
        '0.000196'
      );
      assert.strictEqual(formatDecimalPrice('0.5', 3), '0.500');
      assert.strictEqual(formatDecimalPrice('2.345', 3), '2.35');
      assert.isNull(formatDecimalPrice('x', 3));
    });

    it('writes market figures in whole dollars from 1 000 up', () => {
      assert.strictEqual(formatUsdStat(3770.24), '3,770');
      assert.strictEqual(formatUsdStat(8411.5), '8,412');
      assert.strictEqual(formatUsdStat(999.994), '999.99');
      assert.strictEqual(formatUsdStat(328.52), '328.52');
      assert.strictEqual(formatUsdStat(0), '0.00');
      assert.strictEqual(formatUsdStat(-5), '0.00');
    });

    it('shortens a pool id and a contract', () => {
      assert.strictEqual(shortenHex(POOL), '0xf1e0…4599');
      assert.strictEqual(
        shortenHex('0xf904C14d21bEF5b8a5345a666C77C9cc2A24043B'),
        '0xf904…043B'
      );
      assert.strictEqual(shortenHex('0x1234'), '0x1234');
    });

    it('cuts the chart ranges from the hourly and daily series', () => {
      const hourly = Array.from({ length: 48 }, (_, index) => index + 1);
      const reading = {
        sparklineUsd: hourly,
        hourlyFromUnix: 1_000_000,
        dailyUsd: [1, 2, 3],
        dailyFromUnix: 2_000_000,
        hourlyEndsLive: false,
        dailyEndsLive: false,
      };
      const day = priceChartSeries(reading, '24h');
      assert.deepEqual(day?.values, hourly.slice(24));
      assert.strictEqual(day?.fromUnix, 1_000_000 + 24 * 3600);
      assert.strictEqual(day?.stepSeconds, 3600);
      assert.deepEqual(priceChartSeries(reading, '48h')?.values, hourly);
      assert.strictEqual(priceChartSeries(reading, '48h')?.fromUnix, 1_000_000);
      assert.deepEqual(priceChartSeries(reading, '30d'), {
        values: [1, 2, 3],
        fromUnix: 2_000_000,
        stepSeconds: 86_400,
        endsLive: false,
      });
      // Fewer than two points: no range.
      assert.isNull(priceChartSeries({ ...reading, dailyUsd: [1] }, '30d'));
      assert.isNull(
        priceChartSeries(
          { ...reading, sparklineUsd: [], hourlyFromUnix: null },
          '24h'
        )
      );
      // Without a start time, values only.
      assert.isNull(
        priceChartSeries({ ...reading, hourlyFromUnix: null }, '24h')?.fromUnix
      );
    });

    it('places the chart points and finds the extremes', () => {
      const geometry = priceChartGeometry([2, 1, 3], {
        width: 100,
        top: 10,
        bottom: 50,
      });
      assert.deepEqual(geometry?.points, [
        { x: 0, y: 30 },
        { x: 50, y: 50 },
        { x: 100, y: 10 },
      ]);
      assert.strictEqual(geometry?.minIndex, 1);
      assert.strictEqual(geometry?.maxIndex, 2);
      assert.strictEqual(geometry?.line, 'M0,30 L50,50 L100,10');
      assert.strictEqual(
        geometry?.area,
        'M0,30 L50,50 L100,10 L100,50 L0,50 Z'
      );
      assert.isNull(priceChartGeometry([1], { width: 1, top: 0, bottom: 1 }));
    });

    it('finds the value under the pointer', () => {
      assert.strictEqual(priceChartIndexAt(0, 100, 5), 0);
      assert.strictEqual(priceChartIndexAt(49, 100, 5), 2);
      assert.strictEqual(priceChartIndexAt(100, 100, 5), 4);
      assert.strictEqual(priceChartIndexAt(400, 100, 5), 4);
      assert.strictEqual(priceChartIndexAt(-20, 100, 5), 0);
      assert.strictEqual(priceChartIndexAt(50, 100, 1), 0);
    });

    it('links GeckoTerminal only to its pool pages', () => {
      assert.isTrue(
        isGeckoterminalPoolUrl(
          `https://www.geckoterminal.com/base/pools/${POOL}`
        )
      );
      for (const bad of [
        `https://geckoterminal.com/base/pools/${POOL}`,
        `http://www.geckoterminal.com/base/pools/${POOL}`,
        `https://www.geckoterminal.com.evil.example/base/pools/${POOL}`,
        `https://www.geckoterminal.com/base/pools/${POOL}?x=1`,
        `https://www.geckoterminal.com/base/tokens/${POOL}`,
        `https://dexscreener.com/base/${POOL}`,
      ]) {
        assert.isFalse(isGeckoterminalPoolUrl(bad), bad);
      }
    });
  });

  describe('the live price at the end of a series (PD-5c)', () => {
    it('keeps it in every range: 24h is 24 closes and the live price', () => {
      const hourly = Array.from({ length: 49 }, (_, index) => index + 1);
      const reading = {
        sparklineUsd: hourly,
        hourlyFromUnix: 1_000_000,
        dailyUsd: [1, 2, 3, 4],
        dailyFromUnix: 2_000_000,
        hourlyEndsLive: true,
        dailyEndsLive: true,
      };
      const day = priceChartSeries(reading, '24h');
      assert.lengthOf(day?.values ?? [], 25);
      assert.strictEqual(day?.values[24], 49, 'ends at the live price');
      assert.strictEqual(day?.values[0], 25);
      assert.strictEqual(day?.fromUnix, 1_000_000 + 24 * 3600);
      assert.isTrue(day?.endsLive);
      assert.lengthOf(priceChartSeries(reading, '48h')?.values ?? [], 49);
      assert.isTrue(priceChartSeries(reading, '30d')?.endsLive);
      // Without the live price, 24h is the last 24 closes.
      const closesOnly = priceChartSeries(
        { ...reading, hourlyEndsLive: false },
        '24h'
      );
      assert.lengthOf(closesOnly?.values ?? [], 24);
      assert.isFalse(closesOnly?.endsLive);
    });
  });
});
