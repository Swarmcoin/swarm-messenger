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
import type { SwarmWalletPaneProps } from '../../components/SwarmWalletPane.dom.tsx';
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
  priceState?: SwarmPriceStateType
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

    // The card opens the pool page in the system browser.
    assert.match(
      html,
      new RegExp(
        `<a data-testid="price-card"[^>]*href="https://dexscreener.com/base/${POOL}" target="_blank" rel="noreferrer"`
      )
    );
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
    // Not a link without a reading.
    assert.include(html, '<section data-testid="price-card"');
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

  it('is not a link without a DexScreener page', () => {
    const html = render(
      state({}),
      price({ reading: { ...READING, dexscreenerUrl: null } })
    );
    assert.include(html, '<section data-testid="price-card"');
    assert.notInclude(html, 'dexscreener.com');
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
