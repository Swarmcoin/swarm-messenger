// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (PD-5, 2026-10-05): the SWM price in the Wallet pane.
//
// Presentational only, like the pane: it draws what the main process answered
// on `swarm-wallet:price-get` and hands the switch back through a callback. It
// keeps no clock of its own ("updated 12 s ago" is the main process's count,
// refreshed by the pane's poll) and no price of its own.
//
// specs/PRICE-DISPLAY.md section 3: a calm card - label, freshness dot, the
// price, a plain signed change, a 48-hour sparkline, where the price comes
// from - that opens the pool's DexScreener page in the system browser; the
// value of a balance and of an amount being sent, "≈ $… USD", greyed when the
// price is not current; and the switch that stops every price request.

import { useId } from 'react';
import type { JSX, ReactNode } from 'react';

import { tw } from '../axo/tw.dom.tsx';
import { AxoSwitch } from '../axo/AxoSwitch.dom.tsx';
import {
  fiatCentsForZatoshi,
  formatPriceChange,
  formatUsdCents,
  formatUsdPrice,
  priceSourceNames,
  sparklinePaths,
} from '../util/swarm/swarmPrice.std.ts';
import type { LocalizerType } from '../types/Util.std.ts';
import type {
  SwarmPriceReadingType,
  SwarmPriceStateType,
} from '../types/SwarmWallet.std.ts';

/** The reading to show, and whether it is greyed; null when nothing is shown. */
export function shownPrice(
  price: SwarmPriceStateType | undefined
): { reading: SwarmPriceReadingType; dimmed: boolean } | null {
  if (price?.reading == null) {
    return null;
  }
  switch (price.status) {
    case 'fresh':
      return { reading: price.reading, dimmed: false };
    case 'ageing':
    case 'stale':
      return { reading: price.reading, dimmed: true };
    default:
      return null;
  }
}

/**
 * "≈ $9,364.10 USD" for an amount of zatoshi, or nothing when there is no
 * price to show. Worked out in bigint from the zatoshi and the price's digits.
 */
export function FiatAmount({
  i18n,
  zatoshi,
  price,
  testId,
}: {
  i18n: LocalizerType;
  zatoshi: bigint;
  price: SwarmPriceStateType | undefined;
  testId?: string;
}): JSX.Element | null {
  const shown = shownPrice(price);
  if (shown == null) {
    return null;
  }
  const cents = fiatCentsForZatoshi(zatoshi, shown.reading.priceUsd);
  if (cents == null) {
    return null;
  }
  // A span, not a paragraph: the send form puts it inside a label.
  return (
    <span
      data-testid={testId}
      data-price-dimmed={shown.dimmed ? 'true' : 'false'}
      className={tw(
        'block font-swarm-mono type-body-medium',
        shown.dimmed ? 'text-disabled' : 'text-secondary'
      )}
    >
      {i18n('icu:SwarmWallet__price--fiat', {
        amount: formatUsdCents(cents),
      })}
    </span>
  );
}

function freshnessDotClass(status: SwarmPriceStateType['status']): string {
  switch (status) {
    case 'fresh':
      return tw('bg-(--axo-color-brand-primary)');
    case 'ageing':
      return tw('bg-warning-bright');
    default:
      return tw('bg-tertiary');
  }
}

function formatClock(i18n: LocalizerType, epochMs: number): string {
  try {
    return new Intl.DateTimeFormat(i18n.getLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    }).format(epochMs);
  } catch {
    return new Date(epochMs).toISOString().slice(11, 16);
  }
}

function updatedText(i18n: LocalizerType, price: SwarmPriceStateType): string {
  const { ageSeconds, fetchedAt, status } = price;
  if (status !== 'fresh' && fetchedAt != null) {
    return i18n('icu:SwarmWallet__price--as-of', {
      time: formatClock(i18n, fetchedAt),
    });
  }
  const seconds = ageSeconds ?? 0;
  if (seconds < 60) {
    return i18n('icu:SwarmWallet__price--updated--seconds', { seconds });
  }
  return i18n('icu:SwarmWallet__price--updated--minutes', {
    minutes: Math.floor(seconds / 60),
  });
}

function ChangeChip({
  i18n,
  percent,
}: {
  i18n: LocalizerType;
  percent: number;
}): JSX.Element {
  const change = formatPriceChange(percent);
  let text: string;
  let colour: string;
  switch (change.direction) {
    case 'up':
      text = i18n('icu:SwarmWallet__price--change--up', {
        change: change.text,
      });
      colour = tw('bg-affirmative-tint text-affirmative');
      break;
    case 'down':
      text = i18n('icu:SwarmWallet__price--change--down', {
        change: change.text,
      });
      colour = tw('bg-destructive-tint text-destructive');
      break;
    default:
      text = i18n('icu:SwarmWallet__price--change--flat', {
        change: change.text,
      });
      colour = tw('bg-secondary text-secondary');
  }
  return (
    <span
      data-testid="price-change"
      data-direction={change.direction}
      className={tw(
        'rounded-full px-2 py-0.5 font-swarm-mono type-body-small',
        colour
      )}
    >
      {text}
    </span>
  );
}

const SPARK_WIDTH = 280;
const SPARK_HEIGHT = 48;

function Sparkline({
  i18n,
  values,
}: {
  i18n: LocalizerType;
  values: ReadonlyArray<number>;
}): JSX.Element | null {
  const gradientId = useId();
  const paths = sparklinePaths(values, SPARK_WIDTH, SPARK_HEIGHT);
  if (paths == null) {
    return null;
  }
  return (
    <svg
      data-testid="price-sparkline"
      role="img"
      aria-label={i18n('icu:SwarmWallet__price--sparkline')}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      className={tw('h-12 w-full text-(--axo-color-brand-primary)')}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={paths.area} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={paths.line}
        fill="none"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={tw('stroke-(--axo-color-brand-primary)')}
      />
    </svg>
  );
}

/**
 * The price card. Nothing when the switch is off or the wallet is not on
 * SWARM Mainnet; a quiet line while waiting or when the price is unavailable.
 */
export function PriceCard({
  i18n,
  price,
}: {
  i18n: LocalizerType;
  price: SwarmPriceStateType | undefined;
}): JSX.Element | null {
  if (
    price == null ||
    price.status === 'off' ||
    price.status === 'not-mainnet'
  ) {
    return null;
  }
  const shown = shownPrice(price);
  const info = i18n('icu:SwarmWallet__price--info');

  const labelRow = (
    <div className={tw('flex items-center gap-2')}>
      <span
        className={tw(
          'font-swarm-mono type-caption tracking-[0.12em] text-secondary uppercase'
        )}
      >
        {i18n('icu:SwarmWallet__price--title')}
      </span>
      <span
        data-testid="price-freshness"
        data-freshness={price.status}
        aria-hidden="true"
        className={tw('size-2 rounded-full', freshnessDotClass(price.status))}
      />
      <span
        data-testid="price-info"
        title={info}
        aria-label={info}
        role="note"
        className={tw('ms-auto type-body-medium text-secondary')}
      >
        ⓘ
      </span>
    </div>
  );

  let body: ReactNode;
  if (shown == null) {
    body = (
      <p
        data-testid="price-unavailable"
        className={tw('type-body-medium text-secondary')}
      >
        {price.status === 'waiting'
          ? i18n('icu:SwarmWallet__price--waiting')
          : i18n('icu:SwarmWallet__price--unavailable')}
      </p>
    );
  } else {
    const { reading, dimmed } = shown;
    const meta = [
      ...priceSourceNames([reading.chain, reading.dex, reading.source]),
      updatedText(i18n, price),
    ];
    body = (
      <>
        <div className={tw('flex flex-wrap items-baseline gap-x-3 gap-y-1')}>
          <span
            className={tw(
              'flex items-baseline gap-1.5',
              dimmed ? 'text-disabled' : 'text-primary'
            )}
          >
            <span
              data-testid="price-usd"
              className={tw('font-display text-[32px]/10 font-semibold')}
            >
              {`$${formatUsdPrice(reading.priceUsd) ?? ''}`}
            </span>
            <span className={tw('font-swarm-mono type-body-small')}>
              {i18n('icu:SwarmWallet__price--usd')}
            </span>
          </span>
          {reading.changePct24h != null ? (
            <ChangeChip i18n={i18n} percent={reading.changePct24h} />
          ) : null}
          {price.status === 'stale' ? (
            <span
              data-testid="price-stale"
              className={tw('type-body-small text-secondary')}
            >
              {i18n('icu:SwarmWallet__price--stale')}
            </span>
          ) : null}
        </div>
        <Sparkline i18n={i18n} values={reading.sparklineUsd} />
        <p
          data-testid="price-meta"
          className={tw('font-swarm-mono type-caption text-secondary')}
        >
          {meta.join(' · ')}
        </p>
      </>
    );
  }

  const cardClass = tw(
    'flex flex-col gap-3 rounded-lg bg-surface-secondary p-4 text-start text-primary'
  );
  const url = shown?.reading.dexscreenerUrl;
  if (url != null) {
    return (
      <a
        data-testid="price-card"
        data-price-status={price.status}
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={i18n('icu:SwarmWallet__price--open-pool')}
        className={tw(
          cardClass,
          'no-underline outline-none hover:bg-surface-tertiary focus-visible:axo-focus-ring'
        )}
      >
        {labelRow}
        {body}
      </a>
    );
  }
  return (
    <section
      data-testid="price-card"
      data-price-status={price.status}
      className={cardClass}
    >
      {labelRow}
      {body}
    </section>
  );
}

/**
 * "Show SWM price (USD)", with the spec's sentence on what it asks for and
 * from where. Shown only on SWARM Mainnet, where there is a price to show.
 */
export function PriceSetting({
  i18n,
  price,
  onSetPriceEnabled,
}: {
  i18n: LocalizerType;
  price: SwarmPriceStateType | undefined;
  onSetPriceEnabled: ((enabled: boolean) => void) | undefined;
}): JSX.Element | null {
  const labelId = useId();
  if (
    price == null ||
    onSetPriceEnabled == null ||
    price.status === 'not-mainnet'
  ) {
    return null;
  }
  return (
    <section
      data-testid="price-setting"
      className={tw('flex flex-col gap-2 rounded-lg bg-surface-secondary p-4')}
    >
      <div className={tw('flex items-center gap-3')}>
        <span id={labelId} className={tw('grow type-body-medium text-primary')}>
          {i18n('icu:SwarmWallet__price--setting')}
        </span>
        <AxoSwitch.Root
          labelledby={labelId}
          checked={price.enabled}
          onCheckedChange={onSetPriceEnabled}
        />
      </div>
      <p className={tw('type-body-small text-secondary')}>
        {i18n('icu:SwarmWallet__price--setting--help')}
      </p>
    </section>
  );
}
