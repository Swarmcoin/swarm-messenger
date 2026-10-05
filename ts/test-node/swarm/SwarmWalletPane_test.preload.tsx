// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (M3): the Wallet pane in each of its states, rendered to
// markup with the real English strings. What must hold: loading says so, an
// unreachable light server is said in plain words and offers a retry and no
// send form, and a ready wallet shows the network, the height, the balance
// with eight decimals, the address with its QR code, and the send form.

import { assert } from 'chai';
import { renderToStaticMarkup } from 'react-dom/server';

import i18n from '../util/i18n.node.ts';
import { AxoProvider } from '../../axo/AxoProvider.dom.tsx';
import type { AxoIntl } from '../../axo/_internal/AxoIntl.dom.tsx';
import {
  SwarmWalletPane,
  refusalText,
} from '../../components/SwarmWalletPane.dom.tsx';
import type {
  SwarmWalletPaneProps,
  SwarmWalletViewType,
} from '../../components/SwarmWalletPane.dom.tsx';
import { SwarmPricePage } from '../../components/SwarmPricePage.dom.tsx';
import type { SwarmPricePageProps } from '../../components/SwarmPricePage.dom.tsx';
import { FiatAmount, PriceCard } from '../../components/SwarmPrice.dom.tsx';
import type {
  SwarmPriceReadingType,
  SwarmPriceStateType,
  SwarmWalletStateType,
} from '../../types/SwarmWallet.std.ts';
import { bech32mAddress } from '../../test-helpers/swarmAddresses.std.ts';

const ADDRESS = bech32mAddress('swm', 11);
const TXID = 'ab'.repeat(32);

const MAINNET = {
  id: 'mainnet',
  chain: 'swarm-mainnet',
  server: 'lwd-main.swarm.green:443',
  explorer: 'https://explore.swarm.green/',
} as const;

function state(overrides: Partial<SwarmWalletStateType>): SwarmWalletStateType {
  return {
    status: 'ready',
    problem: null,
    network: MAINNET,
    canSwitchNetwork: false,
    serverHeight: 1438,
    syncedHeight: 1438,
    syncing: false,
    genesisVerified: true,
    encryptedAtRest: true,
    balance: { confirmedZat: '0', pendingZat: '0', totalZat: '0' },
    address: ADDRESS,
    transactions: [],
    checkedAt: 1_790_000_000_000,
    ...overrides,
  };
}

const AXO_MESSAGES: AxoIntl.Messages = {
  'AxoAlertDialog.Cancel': 'Cancel',
  'AxoButton.Pending': 'Pending',
  'AxoDialog.Back': 'Back',
  'AxoDialog.Close': 'Close',
  'AxoTextField.Clear': 'Clear',
  'AxoPasswordField.Reveal': 'Show Password',
  'AxoBadge.MaxOverflow': (max: number) => `${max}+`,
  'AxoContactName.InSystemContactsLabel': 'This person is in your contacts.',
};

function render(
  walletState: SwarmWalletStateType | undefined,
  priceState?: SwarmPriceStateType,
  initialView?: SwarmWalletViewType
): string {
  const props: SwarmWalletPaneProps = {
    i18n,
    state: walletState,
    onRestore: async () => null,
    onRetry: () => undefined,
    onQuote: async () => ({
      ok: false,
      refusal: {
        kind: 'rejected',
        detail: null,
        needZat: null,
        haveZat: null,
      },
    }),
    onConfirm: async () => ({
      ok: false,
      refusal: {
        kind: 'rejected',
        detail: null,
        needZat: null,
        haveZat: null,
      },
    }),
    onCancelQuote: () => undefined,
    onSetNetwork: () => undefined,
    onCopyAddress: () => undefined,
    onRevealRecoveryPhrase: async () => ({ ok: true }),
    price: priceState,
    onSetPriceEnabled: () => undefined,
    initialView,
  };
  return renderToStaticMarkup(
    <AxoProvider
      resolvedAppLocale={{
        tag: 'en' as AxoIntl.AppLocaleTag,
        direction: 'ltr',
      }}
      systemPreferredLanguages={new Set()}
      messages={AXO_MESSAGES}
    >
      <SwarmWalletPane {...props} />
    </AxoProvider>
  );
}

describe('SWARM wallet: the Wallet pane', () => {
  it('says it is loading before the first answer', () => {
    const html = render(undefined);
    assert.include(html, 'data-wallet-status="loading"');
    assert.include(html, 'Opening your wallet');
    assert.notInclude(html, 'data-testid="send-form"');
  });

  it('says in plain words that the network cannot be reached', () => {
    const html = render(
      state({
        status: 'offline',
        problem: 'offline',
        balance: null,
        address: null,
        serverHeight: null,
        syncedHeight: null,
      })
    );
    assert.include(html, 'data-wallet-status="offline"');
    assert.include(html, 'Can’t reach the SWARM network');
    assert.include(html, 'lwd-main.swarm.green:443');
    assert.include(html, 'chats keep working');
    assert.include(html, 'Try again');
    // Nothing that suggests money can move while nothing can be checked.
    assert.notInclude(html, 'data-testid="send-form"');
    assert.notInclude(html, ADDRESS);
  });

  it('keeps the last known balance on screen while offline', () => {
    const html = render(
      state({
        status: 'offline',
        problem: 'offline',
        balance: {
          confirmedZat: '150000000',
          pendingZat: '0',
          totalZat: '150000000',
        },
      })
    );
    assert.include(html, 'Last known balance');
    assert.include(html, '1.50000000 SWM');
    assert.notInclude(html, 'data-testid="send-form"');
  });

  // SWARM addition (B6, 2026-09-29): "Recovery phrase".
  describe('the recovery phrase card', () => {
    it('offers the words, says who owns them, and holds none of them', () => {
      const html = render(state({}));
      assert.include(html, 'data-testid="recovery-phrase"');
      assert.include(html, 'Recovery phrase');
      assert.include(html, 'anyone who has them owns both');
      assert.include(html, 'Show recovery phrase');
      // The pane is never given the words, so it cannot draw them.
      assert.notInclude(html, 'data-testid="recovery-words"');
    });

    it('is offered while offline when the wallet is open, not before it opens', () => {
      const open = render(
        state({
          status: 'offline',
          problem: 'offline',
          balance: { confirmedZat: '0', pendingZat: '0', totalZat: '0' },
        })
      );
      assert.include(open, 'data-testid="recovery-phrase"');
      for (const status of ['no-wallet', 'opening', 'unavailable'] as const) {
        assert.notInclude(
          render(state({ status, balance: null, address: null })),
          'data-testid="recovery-phrase"',
          status
        );
      }
      assert.notInclude(
        render(state({ status: 'offline', problem: 'offline', balance: null })),
        'data-testid="recovery-phrase"'
      );
    });
  });

  it('shows a ready wallet: network, height, balance, address, send', () => {
    const html = render(
      state({
        balance: {
          confirmedZat: '123456789',
          pendingZat: '25000',
          totalZat: '123481789',
        },
      })
    );
    assert.include(html, 'data-wallet-status="ready"');
    assert.include(html, 'SWARM mainnet');
    assert.include(html, 'Light server lwd-main.swarm.green:443');
    assert.include(html, 'Block 1,438');
    assert.include(html, 'Up to date');
    assert.include(html, 'Chain checked');
    assert.include(html, '1.23456789 SWM');
    assert.include(html, '0.00025000 SWM');
    assert.include(html, `data-testid="address"`);
    assert.include(html, ADDRESS);
    assert.include(html, 'alt="QR code of your SWARM address"');
    assert.include(html, 'data:image/svg+xml');
    assert.include(html, 'data-testid="send-form"');
    assert.include(html, 'Review payment');
    assert.include(html, 'No transactions yet.');
    assert.notInclude(html, 'data-testid="developer-network"');
  });

  it('says how far a wallet still has to catch up', () => {
    const html = render(state({ syncedHeight: 1000, syncing: true }));
    assert.include(html, 'Catching up: block 1,000 of 1,438');
  });

  it('links each transaction to the explorer page that exists', () => {
    const html = render(
      state({
        transactions: [
          {
            txid: TXID,
            direction: 'out',
            amountZat: '10000',
            feeZat: '10000',
            blockHeight: 1437,
            timestamp: 1_790_000_000,
            memo: 'lunch',
          },
          {
            txid: 'cd'.repeat(32),
            direction: 'unknown',
            amountZat: '5',
            feeZat: null,
            blockHeight: null,
            timestamp: null,
            memo: null,
          },
        ],
      })
    );
    assert.include(
      html,
      `href="https://explore.swarm.green/transactions/${TXID}"`
    );
    assert.notInclude(html, '/tx/');
    assert.include(html, 'Sent');
    assert.include(html, '−0.00010000 SWM');
    assert.include(html, 'Block 1,437');
    assert.include(html, 'lunch');
    // Unknown stays unknown: no sign, not "Received".
    assert.include(html, 'Not yet in a block');
    assert.include(html, '>0.00000005 SWM<');
  });

  it('asks for the 24 words when this computer has no wallet yet', () => {
    const html = render(
      state({ status: 'no-wallet', balance: null, address: null })
    );
    assert.include(html, 'data-wallet-status="no-wallet"');
    assert.include(html, 'Open your wallet');
    assert.include(html, 'the 24 words you wrote down');
    assert.notInclude(html, 'data-testid="send-form"');
  });

  it('says so when the build has no wallet component', () => {
    const html = render(
      state({ status: 'unavailable', problem: 'addon-missing', balance: null })
    );
    assert.include(html, 'has no wallet component');
    assert.include(html, 'Chats work as usual');
  });

  it('names testnet as worthless, and offers the switch only to developers', () => {
    const html = render(
      state({
        canSwitchNetwork: true,
        network: {
          id: 'testnet',
          chain: 'swarm-testnet',
          server: 'lwd.swarm.green:443',
          explorer: 'https://testnet.explore.swarm.green/',
        },
      })
    );
    assert.include(html, 'SWARM testnet (coins have no value)');
    assert.include(html, 'data-testid="developer-network"');
  });

  it('warns when the wallet file is not encrypted at rest', () => {
    const html = render(state({ encryptedAtRest: false }));
    assert.include(html, 'stored unencrypted');
  });

  it('says once, in one sentence, that the SWARM network was restarted', () => {
    const html = render(state({ networkRestarted: true }));
    assert.include(html, 'data-testid="network-restarted"');
    assert.include(
      html,
      'The SWARM network was restarted on 2 October 2026. Your addresses and recovery phrase are unchanged; balances start again from the new chain.'
    );
    for (const quiet of [state({}), state({ networkRestarted: false })]) {
      assert.notInclude(render(quiet), 'data-testid="network-restarted"');
    }
  });

  describe('refusals, in plain words', () => {
    const refusal = (overrides: Parameters<typeof refusalText>[1]) =>
      refusalText(i18n, overrides);

    it('says how much is needed and how much there is', () => {
      assert.strictEqual(
        refusal({
          kind: 'insufficient-funds',
          detail: null,
          needZat: '10000',
          haveZat: '0',
        }),
        'Not enough SWM. This payment needs 0.00010000 SWM and 0.00000000 SWM is available.'
      );
    });

    it('passes the wallet’s sentence about a wrong-network address', () => {
      const detail =
        'That is a SWARM Testnet address (it starts "swarm1…"), and this wallet is on SWARM.';
      assert.strictEqual(
        refusal({
          kind: 'invalid-address',
          detail,
          needZat: null,
          haveZat: null,
        }),
        detail
      );
    });

    it('explains every other refusal', () => {
      for (const kind of [
        'invalid-memo',
        'not-ready',
        'offline',
        'quote-expired',
        'rejected',
      ] as const) {
        const text = refusal({
          kind,
          detail: null,
          needZat: null,
          haveZat: null,
        });
        assert.isAbove(text.length, 10, kind);
        assert.notInclude(text, 'icu:', kind);
      }
      assert.include(
        refusal({
          kind: 'invalid-amount',
          detail: 'too-many-decimals',
          needZat: null,
          haveZat: null,
        }),
        '8 decimal places'
      );
    });
  });
});

// SWARM addition (PD-5, 2026-10-05): the SWM price. ---------------------------

const POOL =
  '0xf1e066d77279b388b40fdca7f5cf4a6559f77bdf9e2e8937ce9c2fe2960f4599';

/** The spec's fixture (section 2.1), as the main process hands it on. */
const READING: SwarmPriceReadingType = {
  priceUsd: '0.84114343',
  changePct24h: 36.72,
  sparklineUsd: [0.5259, 0.573, 0.6361, 0.6533, 0.7537, 0.8411],
  dexscreenerUrl: `https://dexscreener.com/base/${POOL}`,
  chain: 'base',
  dex: 'uniswap-v4',
  source: 'geckoterminal',
  generatedUnix: 1791223633,
  relayStale: false,
  priceEth: '0.000195976',
  changePct1h: 0,
  changePct6h: 28.75,
  hourlyFromUnix: 1791050400,
  dailyUsd: [
    0.2, 0.21, 0.25, 0.24, 0.3, 0.31, 0.33, 0.36, 0.35, 0.41, 0.44, 0.43, 0.47,
    0.5, 0.52, 0.5, 0.55, 0.58, 0.6, 0.57, 0.62, 0.64, 0.66, 0.65, 0.7, 0.72,
    0.75, 0.78, 0.8, 0.8411,
  ],
  dailyFromUnix: 1788652800,
  hourlyEndsLive: false,
  dailyEndsLive: false,
  transactions24h: { buys: 9, sells: 0 },
  liquidityUsd: 3761.34,
  volume24hUsd: 378.11,
  fdvUsd: 8411.43,
  feePct: 0.9,
  poolCreatedUnix: 1790900000,
  poolId: POOL,
  tokenAddress: '0xf904C14d21bEF5b8a5345a666C77C9cc2A24043B',
  geckoterminalUrl: `https://www.geckoterminal.com/base/pools/${POOL}`,
  sources: [
    {
      id: 'geckoterminal',
      ok: true,
      priceUsd: '0.84114343',
      fetchedUnix: 1791223633,
    },
    { id: 'dexscreener', ok: false, priceUsd: null, fetchedUnix: null },
  ],
};

function price(overrides: Partial<SwarmPriceStateType>): SwarmPriceStateType {
  return {
    status: 'fresh',
    enabled: true,
    reading: READING,
    fetchedAt: 1_791_223_633_000,
    ageSeconds: 12,
    ...overrides,
  };
}

const NO_READING = { reading: null, fetchedAt: null, ageSeconds: null };

/** 11 132.58 SWM: $9,364.10 at the fixture's price. */
const BALANCE = {
  confirmedZat: '1113258000000',
  pendingZat: '0',
  totalZat: '1113258000000',
};

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

describe('SWARM wallet: the SWM price in the Wallet pane (PD-5)', () => {
  it('shows a fresh price: card, change, sparkline, source, link', () => {
    const html = render(state({ balance: BALANCE }), price({}));
    const text = textOf(html);

    assert.include(html, 'data-testid="price-card"');
    assert.include(html, 'data-price-status="fresh"');
    assert.include(html, 'data-freshness="fresh"');
    assert.include(text, 'SWM price');
    assert.include(html, 'data-testid="price-usd"');
    assert.include(text, '$0.8411');
    assert.include(text, 'USD');
    assert.include(html, 'data-direction="up"');
    assert.include(text, '▲ 36.7 % 24h');
    assert.include(html, 'data-testid="price-sparkline"');
    assert.match(html, /<path d="M0,[0-9.]+ L56,/);
    assert.include(
      text,
      'Base · Uniswap v4 · GeckoTerminal · updated 12 s ago'
    );

    // SWARM change (PD-5b): the card opens the price page; the listing
    // links are on the page, not on the card.
    assert.match(
      html,
      /<button type="button" data-testid="price-card" data-price-status="fresh" aria-label="Open the SWM price page"/
    );
    assert.notInclude(html, 'dexscreener.com');
    assert.include(html, 'data-wallet-view="wallet"');
    assert.include(
      html,
      'title="Indicative price from the SWM/ETH pool on Base. The pool is small; small trades move it. Not a quote."'
    );

    // Under the balance: what it is worth, not greyed.
    assert.match(
      html,
      /data-testid="balance-fiat" data-price-dimmed="false"[^>]*>≈ \$9,364.10 USD</
    );
    // The switch, on, with what it asks for and from where.
    assert.include(html, 'data-testid="price-setting"');
    assert.include(text, 'Show SWM price (USD)');
    assert.include(text, 'wallet.swarm.green');
    assert.include(text, 'Your addresses and balances are never sent.');
    assert.include(html, 'aria-checked="true"');
    // No inline styles in the price card (the main window's CSP).
    assert.notInclude(
      renderToStaticMarkup(<PriceCard i18n={i18n} price={price({})} />),
      'style='
    );
  });

  it('greys an ageing price and says when it was read', () => {
    const html = render(
      state({ balance: BALANCE }),
      price({ status: 'ageing', ageSeconds: 7 * 60 })
    );
    const text = textOf(html);
    assert.include(html, 'data-price-status="ageing"');
    assert.include(html, 'data-freshness="ageing"');
    assert.match(text, /as of \d{1,2}:\d{2}/);
    assert.notInclude(text, 'updated');
    assert.include(text, '$0.8411');
    assert.match(
      html,
      /data-testid="balance-fiat" data-price-dimmed="true" class="[^"]*text-disabled/
    );
    assert.notInclude(text, 'Price not current');
  });

  it('says a stale price is not current', () => {
    const html = render(
      state({ balance: BALANCE }),
      price({ status: 'stale', ageSeconds: 40 * 60 })
    );
    assert.include(html, 'data-freshness="stale"');
    assert.include(textOf(html), 'Price not current');
    assert.include(html, 'data-price-dimmed="true"');
  });

  it('says "price unavailable" after an hour, and values nothing', () => {
    const html = render(
      state({ balance: BALANCE }),
      price({ status: 'unavailable', ...NO_READING })
    );
    assert.include(textOf(html), 'Price unavailable');
    assert.notInclude(html, 'data-testid="balance-fiat"');
    assert.notInclude(html, 'data-testid="price-usd"');
    // The page can still be opened: it says the same.
    assert.include(
      html,
      'data-testid="price-card" data-price-status="unavailable"'
    );
  });

  it('says it is reading before the first price', () => {
    const html = render(
      state({ balance: BALANCE }),
      price({ status: 'waiting', ...NO_READING })
    );
    assert.include(textOf(html), 'Reading the price…');
    assert.notInclude(html, 'data-testid="balance-fiat"');
  });

  it('shows nothing but the switch, off, when the switch is off', () => {
    const html = render(
      state({ balance: BALANCE }),
      price({ status: 'off', enabled: false, ...NO_READING })
    );
    assert.notInclude(html, 'data-testid="price-card"');
    assert.notInclude(html, 'data-testid="balance-fiat"');
    assert.notInclude(textOf(html), '≈ $');
    assert.include(html, 'data-testid="price-setting"');
    assert.include(html, 'aria-checked="false"');
  });

  it('shows no price and no switch off SWARM Mainnet', () => {
    const html = render(
      state({ balance: BALANCE }),
      price({ status: 'not-mainnet', ...NO_READING })
    );
    assert.notInclude(html, 'data-testid="price-card"');
    assert.notInclude(html, 'data-testid="price-setting"');
    assert.notInclude(textOf(html), '≈ $');
  });

  it('draws the pane as before when the price has not answered yet', () => {
    const html = render(state({ balance: BALANCE }));
    assert.notInclude(html, 'data-testid="price-card"');
    assert.notInclude(html, 'data-testid="price-setting"');
    assert.include(html, 'data-testid="send-form"');
  });

  it('values the last known balance while offline', () => {
    const html = render(
      state({ status: 'offline', problem: 'offline', balance: BALANCE }),
      price({ status: 'ageing', ageSeconds: 6 * 60 })
    );
    assert.include(textOf(html), 'Last known balance');
    assert.include(textOf(html), '≈ $9,364.10 USD');
    assert.include(html, 'data-price-dimmed="true"');
  });

  it('a falling price is red, a flat one neutral, a missing one absent', () => {
    const down = render(
      state({}),
      price({ reading: { ...READING, changePct24h: -3.24 } })
    );
    assert.include(down, 'data-direction="down"');
    assert.include(textOf(down), '▼ 3.2 % 24h');
    assert.match(down, /data-direction="down" class="[^"]*text-destructive/);

    const flat = render(
      state({}),
      price({ reading: { ...READING, changePct24h: 0.01 } })
    );
    assert.include(flat, 'data-direction="flat"');
    assert.include(textOf(flat), '0.0 % 24h');
    assert.notInclude(textOf(flat), '▲');

    const none = render(
      state({}),
      price({ reading: { ...READING, changePct24h: null, sparklineUsd: [] } })
    );
    assert.notInclude(none, 'data-testid="price-change"');
    assert.notInclude(none, 'data-testid="price-sparkline"');
  });

  it('is a plain card where no page can be opened', () => {
    const html = renderToStaticMarkup(
      <PriceCard i18n={i18n} price={price({})} />
    );
    assert.include(html, '<section data-testid="price-card"');
    assert.notInclude(html, '<button');
  });

  it('counts minutes after the first one', () => {
    const html = render(state({}), price({ ageSeconds: 125 }));
    assert.include(textOf(html), 'updated 2 min ago');
  });

  it('the send form’s helper values a typed amount', () => {
    // The send form keeps what is typed in its own state; the line under the
    // amount is this component, given the parsed zatoshi.
    const html = renderToStaticMarkup(
      <FiatAmount
        i18n={i18n}
        testId="send-fiat"
        zatoshi={22_303_000_000n}
        price={price({})}
      />
    );
    assert.include(html, '≈ $187.60 USD');
    assert.include(html, 'data-testid="send-fiat"');
    assert.strictEqual(
      renderToStaticMarkup(
        <FiatAmount i18n={i18n} zatoshi={1n} price={undefined} />
      ),
      ''
    );
  });
});

// SWARM addition (PD-5b, 2026-10-05): the price page. ---------------------------

function renderPage(overrides: Partial<SwarmPricePageProps> = {}): string {
  return renderToStaticMarkup(
    <AxoProvider
      resolvedAppLocale={{
        tag: 'en' as AxoIntl.AppLocaleTag,
        direction: 'ltr',
      }}
      systemPreferredLanguages={new Set()}
      messages={AXO_MESSAGES}
    >
      <SwarmPricePage
        i18n={i18n}
        price={price({})}
        balanceZat={1_113_258_000_000n}
        onBack={() => undefined}
        onSetPriceEnabled={() => undefined}
        onCopy={() => undefined}
        {...overrides}
      />
    </AxoProvider>
  );
}

describe('SWARM wallet: the SWM price page (PD-5b)', () => {
  it('is a view of the Wallet tab, with Back', () => {
    const html = render(state({ balance: BALANCE }), price({}), 'price');
    assert.include(html, 'data-wallet-view="price"');
    assert.include(html, 'data-testid="price-page"');
    assert.include(textOf(html), '‹ Back');
    // The wallet's own cards are not drawn under the page.
    assert.notInclude(html, 'data-testid="send-form"');
    assert.notInclude(html, 'data-testid="recovery-phrase"');
  });

  it('shows everything for a fresh price', () => {
    const html = renderPage();
    const text = textOf(html);
    // Header.
    assert.include(text, 'SWM price');
    assert.include(
      html,
      'data-testid="price-page-freshness" data-freshness="fresh"'
    );
    assert.include(text, 'updated 12 s ago');
    // Price block: USD, ETH, three chips.
    assert.include(text, '$0.8411');
    assert.include(text, '0.000196 ETH');
    assert.include(html, 'data-period="1h" data-direction="flat"');
    assert.include(html, 'data-period="6h" data-direction="up"');
    assert.include(html, 'data-period="24h" data-direction="up"');
    assert.include(text, '0.0 % 1h');
    assert.include(text, '▲ 28.8 % 6h');
    assert.include(text, '▲ 36.7 % 24h');
    // Chart: 24h first, the latest value labelled, a readout.
    assert.include(html, 'data-testid="price-chart" data-range="24h"');
    assert.include(html, 'data-testid="price-chart-line"');
    assert.include(html, 'data-testid="price-chart-latest"');
    assert.match(text, /\$0\.8411 · \w{3} \d{1,2} \d{2}:\d{2}/);
    // Balance.
    assert.include(text, 'Your balance');
    assert.include(text, '132.58000000 SWM');
    assert.include(text, '≈ $9,364.10 USD');
    // Stats.
    assert.match(html, /data-testid="price-stat-liquidity"[^>]*>\$3,761</);
    assert.match(html, /data-testid="price-stat-volume"[^>]*>\$378.11</);
    assert.match(html, /data-testid="price-stat-fdv"[^>]*>\$8,411</);
    assert.match(html, /data-testid="price-stat-txns"[^>]*>9 \/ 0</);
    assert.match(html, /data-testid="price-stat-fee"[^>]*>0.9 %</);
    assert.match(html, /data-testid="price-stat-network"[^>]*>Base</);
    // Sources: links on the fixed hosts only; a failed one greyed with a dash.
    assert.match(
      html,
      new RegExp(
        `<a href="https://www.geckoterminal.com/base/pools/${POOL}" target="_blank" rel="noreferrer" aria-label="Open GeckoTerminal in the browser"`
      )
    );
    assert.match(
      html,
      new RegExp(
        `<a href="https://dexscreener.com/base/${POOL}" target="_blank" rel="noreferrer" aria-label="Open DexScreener in the browser"`
      )
    );
    assert.include(
      html,
      'data-testid="price-source-geckoterminal" data-source-ok="true"'
    );
    assert.include(
      html,
      'data-testid="price-source-dexscreener" data-source-ok="false"'
    );
    assert.include(html, 'aria-label="Not read at the last attempt"');
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    for (const href of hrefs) {
      assert.match(
        href ?? '',
        /^https:\/\/(dexscreener\.com|www\.geckoterminal\.com)\//,
        'every link stays on the fixed hosts'
      );
    }
    // Pool and token, shortened, with Copy.
    assert.include(text, '0xf1e0…4599');
    assert.include(text, '0xf904…043B');
    assert.include(html, `title="${POOL}"`);
    assert.include(text, 'Copy');
    // The note and the shared switch.
    assert.include(text, 'Indicative price from the SWM/ETH pool on Base.');
    assert.include(text, 'Show SWM price (USD)');
    assert.include(html, 'aria-checked="true"');
    // No inline styles in what this page draws itself (the switch is the
    // app's own component, Radix underneath).
    assert.notInclude(renderPage({ onSetPriceEnabled: undefined }), 'style=');
  });

  it('switches the chart range: 24h, 48h and 30d draw different series', () => {
    // 48 hourly values that are not a straight line, so 24h and 48h differ.
    const hourly = Array.from(
      { length: 48 },
      (_, index) => 0.5 + (index % 7) * 0.01 + index * 0.003
    );
    const withHourly = price({ reading: { ...READING, sparklineUsd: hourly } });
    const lines = (['24h', '48h', '30d'] as const).map(range => {
      const html = renderPage({ price: withHourly, initialRange: range });
      assert.include(html, `data-testid="price-chart" data-range="${range}"`);
      assert.include(
        html,
        `data-testid="price-range-${range}" aria-pressed="true"`
      );
      return /data-testid="price-chart-line" d="([^"]+)"/.exec(html)?.[1];
    });
    assert.lengthOf(new Set(lines), 3);
    // 30d reads out a day, without a clock time.
    const thirty = renderPage({ initialRange: '30d' });
    assert.match(textOf(thirty), /\$0\.8411 · \w{3} \d{1,2}(?! \d{2}:)/);
  });

  it('reads out the value and time under the pointer', () => {
    const html = renderPage({ initialRange: '48h', initialHoverIndex: 0 });
    assert.include(html, 'data-testid="price-chart-hover"');
    assert.match(textOf(html), /\$0\.5259 · \w{3} \d{1,2} \d{2}:\d{2}/);
  });

  it('disables a range without data, and opens on one with data', () => {
    const html = renderPage({
      price: price({
        reading: { ...READING, dailyUsd: [], dailyFromUnix: null },
      }),
      initialRange: '30d',
    });
    assert.match(
      html,
      /data-testid="price-range-30d" aria-pressed="false" disabled=""/
    );
    assert.include(html, 'data-testid="price-chart" data-range="24h"');
  });

  it('says so when no range has data', () => {
    const html = renderPage({
      price: price({
        reading: { ...READING, sparklineUsd: [], dailyUsd: [] },
      }),
    });
    assert.include(textOf(html), 'No price history for this range yet.');
    assert.notInclude(html, 'data-testid="price-chart-line"');
  });

  it('labels the lowest and highest values unless the latest says it', () => {
    const html = renderPage({ initialRange: '48h' });
    // Rising series: the latest is the highest, the lowest is labelled.
    assert.include(html, 'data-testid="price-chart-min"');
    assert.notInclude(html, 'data-testid="price-chart-max"');
    const peak = renderPage({
      price: price({
        reading: { ...READING, sparklineUsd: [0.5, 0.9, 0.7, 0.6] },
      }),
      initialRange: '48h',
    });
    assert.include(peak, 'data-testid="price-chart-max"');
    assert.include(peak, 'data-testid="price-chart-min"');
  });

  it('shows dashes for figures the service did not send', () => {
    const html = renderPage({
      price: price({
        reading: {
          ...READING,
          priceEth: null,
          changePct1h: null,
          changePct6h: null,
          transactions24h: null,
          liquidityUsd: null,
          feePct: null,
          sources: [],
          poolId: null,
          tokenAddress: null,
          geckoterminalUrl: null,
        },
      }),
    });
    assert.notInclude(html, 'data-testid="price-page-eth"');
    assert.notInclude(html, 'data-period="1h"');
    assert.match(html, /data-testid="price-stat-liquidity"[^>]*>—</);
    assert.match(html, /data-testid="price-stat-txns"[^>]*>—</);
    assert.notInclude(html, 'geckoterminal.com');
    assert.notInclude(html, 'data-testid="price-page-pool"');
    assert.notInclude(html, 'data-testid="price-page-token"');
  });

  it('shows only the note and the switch when the switch is off', () => {
    const html = renderPage({
      price: price({ status: 'off', enabled: false, ...NO_READING }),
    });
    assert.include(html, 'data-testid="price-page-note"');
    assert.include(html, 'aria-checked="false"');
    for (const part of [
      'price-page-price',
      'price-chart',
      'price-page-balance',
      'price-page-stats',
      'price-page-sources',
      'price-page-freshness',
    ]) {
      assert.notInclude(html, `data-testid="${part}"`, part);
    }
    assert.notInclude(textOf(html), '$');
  });

  it('says when the price is unavailable, and keeps the switch', () => {
    const html = renderPage({
      price: price({ status: 'unavailable', ...NO_READING }),
    });
    assert.include(textOf(html), 'Price unavailable');
    assert.include(html, 'data-testid="price-page-note"');
    assert.notInclude(html, 'data-testid="price-chart"');
  });

  it('greys an ageing price and says when it was read', () => {
    const html = renderPage({
      price: price({ status: 'ageing', ageSeconds: 9 * 60 }),
    });
    assert.include(html, 'data-freshness="ageing"');
    assert.match(textOf(html), /as of \d{1,2}:\d{2}/);
    assert.match(html, /class="flex items-baseline gap-2 text-disabled"/);
  });

  it('has no page off SWARM Mainnet, nor before the wallet is ready', () => {
    const testnet = render(
      state({ balance: BALANCE }),
      price({ status: 'not-mainnet', ...NO_READING }),
      'price'
    );
    assert.include(testnet, 'data-wallet-view="wallet"');
    assert.notInclude(testnet, 'data-testid="price-page"');
    const opening = render(
      state({ status: 'opening', balance: null }),
      price({}),
      'price'
    );
    assert.notInclude(opening, 'data-testid="price-page"');
  });

  it('says "now" for the live price at the end of a series (PD-5c)', () => {
    const hourly = Array.from({ length: 49 }, (_, index) => 0.5 + index / 100);
    const live = price({
      reading: {
        ...READING,
        sparklineUsd: hourly,
        hourlyEndsLive: true,
        dailyEndsLive: true,
      },
    });
    for (const range of ['24h', '48h', '30d'] as const) {
      const html = renderPage({ price: live, initialRange: range });
      assert.match(
        textOf(html),
        /\$\d\.\d{4} · now/,
        `${range}: the latest point is now`
      );
    }
    const day = renderPage({ price: live, initialRange: '24h' });
    // 24 closes and the live price: 25 points.
    const line = /data-testid="price-chart-line" d="([^"]+)"/.exec(day)?.[1];
    assert.lengthOf(line?.split(' L') ?? [], 25);
    assert.include(textOf(day), '$0.9800 · now');
    // A point before the end keeps its time.
    const earlier = renderPage({
      price: live,
      initialRange: '48h',
      initialHoverIndex: 0,
    });
    assert.notMatch(textOf(earlier), /· now/);
    assert.match(textOf(earlier), /\$0\.5000 · \w{3} \d{1,2} \d{2}:\d{2}/);
  });
});
