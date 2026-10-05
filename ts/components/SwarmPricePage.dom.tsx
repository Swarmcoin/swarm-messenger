// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (PD-5b, 2026-10-05): the SWM price page, a view of the
// Wallet tab (specs/PRICE-DISPLAY.md section 6). The price card opens it; Back
// returns to the wallet.
//
// Presentational only, like the card: it draws what the main process answered
// on `swarm-wallet:price-get`. The only things it keeps are the chosen chart
// range, the value under the pointer and the "Copied" flash. Its two external
// links go to the pool's listing pages on dexscreener.com and
// www.geckoterminal.com, whose URLs the main process has already held to
// those hosts; they open in the system browser.

import { useEffect, useId, useState } from 'react';
import type { JSX, MouseEvent, ReactNode } from 'react';

import { tw } from '../axo/tw.dom.tsx';
import { AxoButton } from '../axo/AxoButton.dom.tsx';
import {
  ChangeChip,
  FiatAmount,
  PriceSetting,
  formatClock,
  freshnessDotClass,
  shownPrice,
  updatedText,
} from './SwarmPrice.dom.tsx';
import { Amount } from './SwarmSendFlow.dom.tsx';
import {
  PRICE_CHART_RANGES,
  formatDecimalPrice,
  formatUsdPrice,
  formatUsdStat,
  priceChartGeometry,
  priceChartIndexAt,
  priceChartSeries,
  priceSourceNames,
  shortenHex,
} from '../util/swarm/swarmPrice.std.ts';
import type {
  PriceChartRangeType,
  PriceChartSeriesType,
} from '../util/swarm/swarmPrice.std.ts';
import type { LocalizerType } from '../types/Util.std.ts';
import type {
  SwarmPriceReadingType,
  SwarmPriceStateType,
} from '../types/SwarmWallet.std.ts';

export type SwarmPricePageProps = Readonly<{
  i18n: LocalizerType;
  price: SwarmPriceStateType;
  /** The wallet's whole balance (confirmed and pending), or null. */
  balanceZat: bigint | null;
  onBack: () => void;
  onSetPriceEnabled: ((enabled: boolean) => void) | undefined;
  /** Copies the full pool id or token contract (the pane's clipboard). */
  onCopy: (text: string) => void;
  /** The chart range shown first; the first one with data when omitted. */
  initialRange?: PriceChartRangeType;
  /** The point under the pointer at first (for pictures and tests). */
  initialHoverIndex?: number;
}>;

const CARD = tw('flex flex-col gap-3 rounded-lg bg-surface-secondary p-4');

/** A chart value (a float from the service) as the card writes a price. */
function chartValueText(value: number): string {
  return formatUsdPrice(value.toFixed(12)) ?? '—';
}

export function SwarmPricePage(props: SwarmPricePageProps): JSX.Element {
  const { i18n, price } = props;
  const shown = shownPrice(price);
  const note = (
    <section
      data-testid="price-page-note"
      className={tw('flex flex-col gap-4')}
    >
      <p className={tw('type-body-small text-secondary')}>
        {i18n('icu:SwarmWallet__price--info')}
      </p>
      <PriceSetting
        i18n={i18n}
        price={price}
        onSetPriceEnabled={props.onSetPriceEnabled}
      />
    </section>
  );

  let body: ReactNode;
  if (price.status === 'off') {
    // Off: the note and the switch, nothing else.
    body = null;
  } else if (shown == null) {
    body = (
      <p
        data-testid="price-page-unavailable"
        className={tw('type-body-medium text-secondary')}
      >
        {price.status === 'waiting'
          ? i18n('icu:SwarmWallet__price--waiting')
          : i18n('icu:SwarmWallet__price--unavailable')}
      </p>
    );
  } else {
    body = (
      <>
        <PriceBlock i18n={i18n} reading={shown.reading} dimmed={shown.dimmed} />
        <Chart
          i18n={i18n}
          reading={shown.reading}
          initialRange={props.initialRange}
          initialHoverIndex={props.initialHoverIndex}
        />
        {props.balanceZat != null ? (
          <section
            data-testid="price-page-balance"
            className={tw(CARD, 'gap-1')}
          >
            <h2 className={tw('type-title-small text-primary')}>
              {i18n('icu:SwarmWallet__price--page-balance')}
            </h2>
            <span className={tw('type-title-medium')}>
              <Amount i18n={i18n} zatoshi={props.balanceZat} />
            </span>
            <FiatAmount
              i18n={i18n}
              testId="price-page-balance-fiat"
              zatoshi={props.balanceZat}
              price={price}
            />
          </section>
        ) : null}
        <Stats i18n={i18n} reading={shown.reading} />
        <Sources i18n={i18n} reading={shown.reading} onCopy={props.onCopy} />
      </>
    );
  }

  return (
    <div
      data-testid="price-page"
      data-price-status={price.status}
      className={tw('flex flex-col gap-6')}
    >
      <header className={tw('flex flex-col gap-3')}>
        <div>
          <AxoButton.Root
            variant="subtle-secondary"
            size="sm"
            onClick={props.onBack}
          >
            {`‹ ${i18n('icu:SwarmWallet__price--page-back')}`}
          </AxoButton.Root>
        </div>
        <div className={tw('flex flex-wrap items-center gap-x-3 gap-y-1')}>
          <h1 className={tw('type-title-large text-primary')}>
            {i18n('icu:SwarmWallet__price--page-title')}
          </h1>
          {price.status !== 'off' ? (
            <span className={tw('flex items-center gap-2')}>
              <span
                data-testid="price-page-freshness"
                data-freshness={price.status}
                aria-hidden="true"
                className={tw(
                  'size-2 rounded-full',
                  freshnessDotClass(price.status)
                )}
              />
              {shown != null ? (
                <span
                  data-testid="price-page-updated"
                  className={tw('font-swarm-mono type-caption text-secondary')}
                >
                  {updatedText(i18n, price)}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </header>
      {body}
      {note}
    </div>
  );
}

function PriceBlock({
  i18n,
  reading,
  dimmed,
}: {
  i18n: LocalizerType;
  reading: SwarmPriceReadingType;
  dimmed: boolean;
}): JSX.Element {
  const eth =
    reading.priceEth == null ? null : formatDecimalPrice(reading.priceEth, 3);
  const chips: Array<[number | null, '1h' | '6h' | '24h']> = [
    [reading.changePct1h, '1h'],
    [reading.changePct6h, '6h'],
    [reading.changePct24h, '24h'],
  ];
  return (
    <section
      data-testid="price-page-price"
      className={tw('flex flex-col gap-2')}
    >
      <div
        className={tw(
          'flex items-baseline gap-2',
          dimmed ? 'text-disabled' : 'text-primary'
        )}
      >
        <span
          data-testid="price-page-usd"
          className={tw('font-display text-[48px]/14 font-semibold')}
        >
          {`$${formatUsdPrice(reading.priceUsd) ?? ''}`}
        </span>
        <span className={tw('font-swarm-mono type-body-medium')}>
          {i18n('icu:SwarmWallet__price--usd')}
        </span>
      </div>
      {eth != null ? (
        <span
          data-testid="price-page-eth"
          className={tw('font-swarm-mono type-body-small text-secondary')}
        >
          {i18n('icu:SwarmWallet__price--page-eth', { price: eth })}
        </span>
      ) : null}
      <div className={tw('flex flex-wrap gap-2')}>
        {chips.map(([percent, period]) =>
          percent == null ? null : (
            <ChangeChip
              key={period}
              i18n={i18n}
              percent={percent}
              period={period}
            />
          )
        )}
      </div>
    </section>
  );
}

// The chart -----------------------------------------------------------------------

const CHART_WIDTH = 560;
const CHART_HEIGHT = 200;
/** The plot; the strip to its right holds the value labels. */
const PLOT_WIDTH = 468;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 186;
const LABEL_X = PLOT_WIDTH + 10;

function rangeLabel(i18n: LocalizerType, range: PriceChartRangeType): string {
  switch (range) {
    case '24h':
      return i18n('icu:SwarmWallet__price--page-range--24h');
    case '48h':
      return i18n('icu:SwarmWallet__price--page-range--48h');
    default:
      return i18n('icu:SwarmWallet__price--page-range--30d');
  }
}

function pointTime(
  i18n: LocalizerType,
  series: PriceChartSeriesType,
  index: number
): string | null {
  if (series.fromUnix == null) {
    return null;
  }
  const epochMs = (series.fromUnix + index * series.stepSeconds) * 1000;
  if (series.stepSeconds < 24 * 3600) {
    let day: string;
    try {
      day = new Intl.DateTimeFormat(i18n.getLocale(), {
        month: 'short',
        day: 'numeric',
      }).format(epochMs);
    } catch {
      day = new Date(epochMs).toISOString().slice(5, 10);
    }
    return `${day} ${formatClock(i18n, epochMs)}`;
  }
  try {
    return new Intl.DateTimeFormat(i18n.getLocale(), {
      month: 'short',
      day: 'numeric',
    }).format(epochMs);
  } catch {
    return new Date(epochMs).toISOString().slice(0, 10);
  }
}

function Chart({
  i18n,
  reading,
  initialRange,
  initialHoverIndex,
}: {
  i18n: LocalizerType;
  reading: SwarmPriceReadingType;
  initialRange: PriceChartRangeType | undefined;
  initialHoverIndex: number | undefined;
}): JSX.Element {
  const gradientId = useId();
  const available = PRICE_CHART_RANGES.filter(
    range => priceChartSeries(reading, range) != null
  );
  const [chosen, setChosen] = useState<PriceChartRangeType | undefined>(
    initialRange
  );
  const [hover, setHover] = useState<number | null>(initialHoverIndex ?? null);

  // The chosen range, or the first one with data when it has none.
  const range =
    chosen != null && available.includes(chosen) ? chosen : available[0];
  const series = range == null ? null : priceChartSeries(reading, range);
  const geometry =
    series == null
      ? null
      : priceChartGeometry(series.values, {
          width: PLOT_WIDTH,
          top: PLOT_TOP,
          bottom: PLOT_BOTTOM,
        });

  const buttons = (
    <div
      role="group"
      aria-label={i18n('icu:SwarmWallet__price--page-ranges')}
      className={tw('flex gap-1')}
    >
      {PRICE_CHART_RANGES.map(option => {
        const enabled = available.includes(option);
        const selected = option === range;
        return (
          <button
            key={option}
            type="button"
            data-testid={`price-range-${option}`}
            aria-pressed={selected}
            disabled={!enabled}
            onClick={() => {
              setChosen(option);
              setHover(null);
            }}
            className={tw(
              'rounded-full px-3 py-1 font-swarm-mono type-body-small',
              'outline-none focus-visible:axo-focus-ring',
              selected
                ? 'bg-secondary text-primary'
                : 'text-secondary enabled:hover:bg-primary',
              'disabled:text-disabled'
            )}
          >
            {rangeLabel(i18n, option)}
          </button>
        );
      })}
    </div>
  );

  if (series == null || geometry == null) {
    return (
      <section data-testid="price-chart" className={CARD}>
        {buttons}
        <p
          data-testid="price-chart-empty"
          className={tw('type-body-medium text-secondary')}
        >
          {i18n('icu:SwarmWallet__price--page-chart--empty')}
        </p>
      </section>
    );
  }

  const { points, minIndex, maxIndex } = geometry;
  const lastIndex = points.length - 1;
  const latest = points[lastIndex] ?? { x: 0, y: 0 };
  const shownIndex =
    hover != null && hover >= 0 && hover <= lastIndex ? hover : lastIndex;
  const shownPoint = points[shownIndex] ?? latest;
  const shownValue = series.values[shownIndex] ?? 0;
  const time = pointTime(i18n, series, shownIndex);
  const readout =
    time == null
      ? i18n('icu:SwarmWallet__price--page-readout--no-time', {
          price: chartValueText(shownValue),
        })
      : i18n('icu:SwarmWallet__price--page-readout', {
          price: chartValueText(shownValue),
          time,
        });

  // The highest and lowest values, unless the latest label already says it.
  const edgeLabels: Array<{ index: number; testId: string }> = [];
  for (const [index, testId] of [
    [maxIndex, 'price-chart-max'],
    [minIndex, 'price-chart-min'],
  ] as const) {
    const point = points[index];
    if (point != null && Math.abs(point.y - latest.y) >= 14) {
      edgeLabels.push({ index, testId });
    }
  }

  const onMove = (event: MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) {
      return;
    }
    const x = ((event.clientX - box.left) / box.width) * CHART_WIDTH;
    setHover(priceChartIndexAt(x, PLOT_WIDTH, points.length));
  };

  return (
    <section data-testid="price-chart" data-range={range} className={CARD}>
      <div className={tw('flex flex-wrap items-center justify-between gap-2')}>
        {buttons}
        <span
          data-testid="price-chart-readout"
          aria-live="polite"
          className={tw('font-swarm-mono type-body-small text-secondary')}
        >
          {readout}
        </span>
      </div>
      <span className={tw('sr-only')}>
        {i18n('icu:SwarmWallet__price--page-chart')}
      </span>
      {/* The picture is for the eye; the readout above says the value. The
          pointer only moves the readout, so the chart takes no focus. */}
      <svg
        data-testid="price-chart-svg"
        aria-hidden="true"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={tw('h-auto w-full text-(--axo-color-brand-primary)')}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[PLOT_TOP, (PLOT_TOP + PLOT_BOTTOM) / 2, PLOT_BOTTOM].map(y => (
          <line
            key={y}
            x1="0"
            x2={PLOT_WIDTH}
            y1={y}
            y2={y}
            strokeWidth="1"
            className={tw('stroke-primary')}
          />
        ))}
        <path d={geometry.area} fill={`url(#${gradientId})`} stroke="none" />
        <path
          data-testid="price-chart-line"
          d={geometry.line}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className={tw('stroke-(--axo-color-brand-primary)')}
        />
        {hover != null ? (
          <line
            data-testid="price-chart-hover"
            x1={shownPoint.x}
            x2={shownPoint.x}
            y1={PLOT_TOP}
            y2={PLOT_BOTTOM}
            strokeWidth="1"
            className={tw('stroke-tertiary')}
          />
        ) : null}
        <circle
          cx={shownPoint.x}
          cy={shownPoint.y}
          r="4"
          className={tw('fill-(--axo-color-brand-primary)')}
        />
        <text
          data-testid="price-chart-latest"
          x={LABEL_X}
          y={latest.y + 4}
          className={tw(
            'fill-(--axo-color-label-primary) font-swarm-mono text-[13px]'
          )}
        >
          {`$${chartValueText(series.values[lastIndex] ?? 0)}`}
        </text>
        {edgeLabels.map(({ index, testId }) => (
          <text
            key={testId}
            data-testid={testId}
            x={LABEL_X}
            y={(points[index]?.y ?? 0) + 4}
            className={tw(
              'fill-(--axo-color-label-secondary) font-swarm-mono text-[12px]'
            )}
          >
            {`$${chartValueText(series.values[index] ?? 0)}`}
          </text>
        ))}
      </svg>
    </section>
  );
}

// Figures and sources ----------------------------------------------------------------

function Stats({
  i18n,
  reading,
}: {
  i18n: LocalizerType;
  reading: SwarmPriceReadingType;
}): JSX.Element {
  const none = i18n('icu:SwarmWallet__price--page-none');
  const usd = (value: number | null) =>
    value == null
      ? none
      : i18n('icu:SwarmWallet__price--page-usd', {
          amount: formatUsdStat(value),
        });
  const rows: Array<[string, string, string]> = [
    [
      'liquidity',
      i18n('icu:SwarmWallet__price--page-stat--liquidity'),
      usd(reading.liquidityUsd),
    ],
    [
      'volume',
      i18n('icu:SwarmWallet__price--page-stat--volume'),
      usd(reading.volume24hUsd),
    ],
    [
      'fdv',
      i18n('icu:SwarmWallet__price--page-stat--fdv'),
      usd(reading.fdvUsd),
    ],
    [
      'txns',
      i18n('icu:SwarmWallet__price--page-stat--txns'),
      reading.transactions24h == null
        ? none
        : i18n('icu:SwarmWallet__price--page-stat--txns-value', {
            buys: reading.transactions24h.buys,
            sells: reading.transactions24h.sells,
          }),
    ],
    [
      'fee',
      i18n('icu:SwarmWallet__price--page-stat--fee'),
      reading.feePct == null
        ? none
        : i18n('icu:SwarmWallet__price--page-stat--fee-value', {
            fee: String(reading.feePct),
          }),
    ],
    [
      'network',
      i18n('icu:SwarmWallet__price--page-stat--network'),
      priceSourceNames([reading.chain])[0] ?? none,
    ],
  ];
  return (
    <section data-testid="price-page-stats" className={CARD}>
      <h2 className={tw('type-title-small text-primary')}>
        {i18n('icu:SwarmWallet__price--page-stats')}
      </h2>
      <dl className={tw('grid grid-cols-2 gap-x-6 gap-y-3')}>
        {rows.map(([id, label, value]) => (
          <div key={id} className={tw('flex flex-col gap-0.5')}>
            <dt className={tw('type-body-small text-secondary')}>{label}</dt>
            <dd
              data-testid={`price-stat-${id}`}
              className={tw('font-swarm-mono type-body-medium text-primary')}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const AGGREGATORS = ['geckoterminal', 'dexscreener'] as const;

function Sources({
  i18n,
  reading,
  onCopy,
}: {
  i18n: LocalizerType;
  reading: SwarmPriceReadingType;
  onCopy: (text: string) => void;
}): JSX.Element {
  const none = i18n('icu:SwarmWallet__price--page-none');
  return (
    <section data-testid="price-page-sources" className={CARD}>
      <h2 className={tw('type-title-small text-primary')}>
        {i18n('icu:SwarmWallet__price--page-sources')}
      </h2>
      <ul className={tw('flex flex-col gap-1')}>
        {AGGREGATORS.map(id => {
          const name = priceSourceNames([id])[0] ?? id;
          const source = reading.sources.find(entry => entry.id === id);
          const ok = source?.ok === true && source.priceUsd != null;
          const url =
            id === 'geckoterminal'
              ? reading.geckoterminalUrl
              : reading.dexscreenerUrl;
          const content = (
            <>
              <span className={tw('grow type-body-medium')}>{name}</span>
              <span className={tw('font-swarm-mono type-body-medium')}>
                {ok ? `$${formatUsdPrice(source.priceUsd ?? '') ?? ''}` : none}
              </span>
              <span
                role="img"
                aria-label={
                  ok
                    ? i18n('icu:SwarmWallet__price--page-source--ok')
                    : i18n('icu:SwarmWallet__price--page-source--failed')
                }
                className={tw(
                  'w-4 text-center type-body-medium',
                  ok ? 'text-affirmative' : 'text-disabled'
                )}
              >
                {ok ? '✓' : '—'}
              </span>
            </>
          );
          const rowClass = tw(
            'flex items-center gap-3 rounded-md px-2 py-1.5',
            ok ? 'text-primary' : 'text-disabled'
          );
          return (
            <li
              key={id}
              data-testid={`price-source-${id}`}
              data-source-ok={ok ? 'true' : 'false'}
            >
              {url != null ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={i18n(
                    'icu:SwarmWallet__price--page-source--open',
                    {
                      source: name,
                    }
                  )}
                  className={tw(
                    rowClass,
                    'no-underline outline-none hover:bg-primary focus-visible:axo-focus-ring'
                  )}
                >
                  {content}
                </a>
              ) : (
                <div className={rowClass}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
      {reading.poolId != null ? (
        <CopyRow
          i18n={i18n}
          testId="price-page-pool"
          label={i18n('icu:SwarmWallet__price--page-pool')}
          value={reading.poolId}
          onCopy={onCopy}
        />
      ) : null}
      {reading.tokenAddress != null ? (
        <CopyRow
          i18n={i18n}
          testId="price-page-token"
          label={i18n('icu:SwarmWallet__price--page-token')}
          value={reading.tokenAddress}
          onCopy={onCopy}
        />
      ) : null}
    </section>
  );
}

/** A shortened id with a Copy button, as the Receive card copies an address. */
function CopyRow({
  i18n,
  testId,
  label,
  value,
  onCopy,
}: {
  i18n: LocalizerType;
  testId: string;
  label: string;
  value: string;
  onCopy: (text: string) => void;
}): JSX.Element {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div
      data-testid={testId}
      className={tw('flex items-center gap-3 px-2 text-primary')}
    >
      <span className={tw('grow type-body-medium')}>{label}</span>
      <code
        title={value}
        className={tw('font-swarm-mono type-body-small select-text')}
      >
        {shortenHex(value)}
      </code>
      <AxoButton.Root
        variant="subtle-secondary"
        size="sm"
        onClick={() => {
          onCopy(value);
          setCopied(true);
        }}
      >
        {copied
          ? i18n('icu:SwarmWallet__price--page-copied')
          : i18n('icu:SwarmWallet__price--page-copy')}
      </AxoButton.Root>
    </div>
  );
}
