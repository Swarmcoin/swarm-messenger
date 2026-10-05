// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (M3 wave 1): everything that crosses between the Wallet pane
// (renderer) and the wallet service (main process), and nothing else.
//
// No shape in this file carries a key, a seed, a wallet file or a path. The one
// thing the renderer ever hands to the main process that is secret is the
// recovery phrase, once, when a wallet is first opened from it - and the phrase
// never comes back. Amounts are zatoshi as decimal strings, because a bigint
// cannot be put in the redux store and a number cannot hold a balance exactly.
// Both sides parse what they receive with these schemas.

import * as z from 'zod';

/** The IPC channels, all `ipcMain.handle` / `ipcRenderer.invoke`. */
export const SWARM_WALLET_CHANNEL = {
  getState: 'swarm-wallet:get-state',
  openWithPhrase: 'swarm-wallet:open-with-phrase',
  refresh: 'swarm-wallet:refresh',
  quoteSend: 'swarm-wallet:quote-send',
  confirmSend: 'swarm-wallet:confirm-send',
  cancelSend: 'swarm-wallet:cancel-send',
  setNetwork: 'swarm-wallet:set-network',
  // SWARM addition (M3 wave 2): payments inside a chat.
  newAddress: 'swarm-wallet:new-address',
  checkAddress: 'swarm-wallet:check-address',
  findTransaction: 'swarm-wallet:find-transaction',
  // SWARM addition (B6, 2026-09-29): opens the recovery phrase window. The
  // words never come back on this channel; see SwarmRecoveryPhrase.std.ts.
  revealRecoveryPhrase: 'swarm-wallet:reveal-recovery-phrase',
  // SWARM addition (PD-5, 2026-10-05): the SWM price from the SWARM price
  // service, read by the main process. See SwarmPrice* below.
  priceGet: 'swarm-wallet:price-get',
  priceSetEnabled: 'swarm-wallet:price-set-enabled',
} as const;

/** A count of zatoshi (1 SWM = 100 000 000), as a decimal string. */
export const ZatoshiStringSchema = z.string().regex(/^(0|[1-9][0-9]{0,18})$/);

/** A transaction id as a node prints it: 64 lowercase hex digits. */
export const TxidSchema = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * The account's ACI identity public key, base64: 33 bytes, libsignal's own
 * serialization, whose first byte is the key type 0x05 - so 44 characters,
 * no padding, starting with "B". Public, and it is what the wallet directory
 * is keyed by.
 */
export const AccountKeySchema = z.string().regex(/^B[A-Za-z0-9+/]{43}$/);

export const SwarmWalletNetworkIdSchema = z.enum(['mainnet', 'testnet']);
export type SwarmWalletNetworkIdType = z.infer<
  typeof SwarmWalletNetworkIdSchema
>;

export const SwarmWalletNetworkSchema = z.object({
  id: SwarmWalletNetworkIdSchema,
  /** The chain label the light server reports, e.g. `swarm-mainnet`. */
  chain: z.string(),
  /** The light server as host:port, for the screen. */
  server: z.string(),
  /** The block explorer for this network, ending in a slash. */
  explorer: z.string(),
});
export type SwarmWalletNetworkType = z.infer<typeof SwarmWalletNetworkSchema>;

export const SwarmWalletStatusSchema = z.enum([
  /** This build has no wallet component (the addon is missing or unloadable). */
  'unavailable',
  /** No wallet for this account on this computer yet. */
  'no-wallet',
  /** Opening or creating the wallet. */
  'opening',
  /** The light server cannot be reached; the wallet file is intact. */
  'offline',
  'ready',
  'error',
]);
export type SwarmWalletStatusType = z.infer<typeof SwarmWalletStatusSchema>;

/** Why the wallet is not ready, in categories the pane has words for. */
export const SwarmWalletProblemSchema = z.enum([
  'addon-missing',
  'offline',
  'wrong-chain',
  'wrong-phrase',
  'invalid-phrase',
  'wallet-file',
  'unexpected',
]);
export type SwarmWalletProblemType = z.infer<typeof SwarmWalletProblemSchema>;

export const SwarmWalletTransactionSchema = z.object({
  txid: TxidSchema,
  direction: z.enum(['in', 'out', 'unknown']),
  amountZat: ZatoshiStringSchema,
  feeZat: ZatoshiStringSchema.nullable(),
  blockHeight: z.number().int().nonnegative().nullable(),
  /** Unix seconds. */
  timestamp: z.number().int().nonnegative().nullable(),
  memo: z.string().nullable(),
});
export type SwarmWalletTransactionType = z.infer<
  typeof SwarmWalletTransactionSchema
>;

export const SwarmWalletBalanceSchema = z.object({
  /** Spendable now, at the wallet's confirmation depth. */
  confirmedZat: ZatoshiStringSchema,
  /** Received but not yet spendable. */
  pendingZat: ZatoshiStringSchema,
  totalZat: ZatoshiStringSchema,
});
export type SwarmWalletBalanceType = z.infer<typeof SwarmWalletBalanceSchema>;

export const SwarmWalletStateSchema = z.object({
  status: SwarmWalletStatusSchema,
  problem: SwarmWalletProblemSchema.nullable(),
  network: SwarmWalletNetworkSchema,
  /** Whether the developer network switch may be offered (never in a release). */
  canSwitchNetwork: z.boolean(),
  /** The chain tip as the light server last reported it. */
  serverHeight: z.number().int().nonnegative().nullable(),
  /** The height this wallet has scanned to. */
  syncedHeight: z.number().int().nonnegative().nullable(),
  syncing: z.boolean(),
  /** Whether the light server stated the genesis this network holds it to. */
  genesisVerified: z.boolean().nullable(),
  /** Whether the wallet file is sealed with a key from the OS keychain. */
  encryptedAtRest: z.boolean().nullable(),
  balance: SwarmWalletBalanceSchema.nullable(),
  /** The receive address, `swm1…` on mainnet. */
  address: z.string().nullable(),
  /** Newest first. */
  transactions: z.array(SwarmWalletTransactionSchema),
  /** When the light server last answered, epoch milliseconds. */
  checkedAt: z.number().nullable(),
  /**
   * SWARM addition (0.1.4): the wallet file was moved onto the SWARM network
   * restarted on 2 October 2026 when it was opened; the pane says so once.
   */
  networkRestarted: z.boolean().optional(),
});
export type SwarmWalletStateType = z.infer<typeof SwarmWalletStateSchema>;

// Requests, renderer -> main ---------------------------------------------------

export const GetStateRequestSchema = z.object({
  accountKey: AccountKeySchema.optional(),
});

export const OpenWithPhraseRequestSchema = z.object({
  phrase: z.string().min(1).max(1024),
  /** True when the phrase was generated moments ago on this computer. */
  isNewPhrase: z.boolean(),
  /** When given, the phrase must derive this account key or it is refused. */
  accountKey: AccountKeySchema.optional(),
});

export const QuoteSendRequestSchema = z.object({
  to: z.string().max(1024),
  /** SWM as the person typed it, e.g. "0.5". Parsed exactly, never as a float. */
  amount: z.string().max(64),
  memo: z.string().max(4096).optional(),
});

export const ConfirmSendRequestSchema = z.object({
  quoteId: z.string().regex(/^[0-9a-f]{32}$/),
});

export const SetNetworkRequestSchema = z.object({
  network: SwarmWalletNetworkIdSchema,
});

// SWARM addition (M3 wave 2) ----------------------------------------------------

/** `swarm-wallet:new-address` takes nothing: the wallet decides everything. */
export const NewAddressRequestSchema = z.object({}).strict();

export const CheckAddressRequestSchema = z.object({
  address: z.string().max(1024),
});

/** SHA-256 as 64 lowercase hex digits. */
export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const FindTransactionRequestSchema = z.object({
  txid: TxidSchema,
  /** The memo hash the payment notice carried, when it carried one. */
  memoHash: Sha256HexSchema.optional(),
  /** As for get-state: the signed-in account, whose wallet is opened. */
  accountKey: AccountKeySchema.optional(),
});

// Answers, main -> renderer ----------------------------------------------------

export const SendRefusalKindSchema = z.enum([
  'invalid-address',
  'invalid-amount',
  'invalid-memo',
  'insufficient-funds',
  'not-ready',
  'offline',
  'quote-expired',
  'rejected',
]);
export type SendRefusalKindType = z.infer<typeof SendRefusalKindSchema>;

export const SendRefusalSchema = z.object({
  kind: SendRefusalKindSchema,
  /**
   * The wallet's own sentence, for an address refusal - it names which network
   * an address belongs to. Never a key and never a path.
   */
  detail: z.string().nullable(),
  /** For insufficient funds: what the payment needs and what is spendable. */
  needZat: ZatoshiStringSchema.nullable(),
  haveZat: ZatoshiStringSchema.nullable(),
});
export type SendRefusalType = z.infer<typeof SendRefusalSchema>;

export const SendQuoteSchema = z.object({
  quoteId: z.string().regex(/^[0-9a-f]{32}$/),
  to: z.string(),
  amountZat: ZatoshiStringSchema,
  feeZat: ZatoshiStringSchema,
  totalZat: ZatoshiStringSchema,
  memo: z.string().nullable(),
  /** Epoch milliseconds after which confirming is refused. */
  expiresAt: z.number(),
});
export type SendQuoteType = z.infer<typeof SendQuoteSchema>;

export const QuoteSendResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), quote: SendQuoteSchema }),
  z.object({ ok: z.literal(false), refusal: SendRefusalSchema }),
]);
export type QuoteSendResultType = z.infer<typeof QuoteSendResultSchema>;

export const ConfirmSendResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    txids: z.array(TxidSchema).min(1),
    /** False when the wallet file could not be saved after the transmit. */
    saved: z.boolean(),
    // SWARM addition (M3 wave 2): what a payment notice in a chat needs, from
    // the main process that sent the payment rather than from the window.
    /** The chain the payment was made on. */
    chain: z.enum(['swarm-mainnet', 'swarm-testnet']),
    /**
     * SHA-256 of the memo as the wallet put it in the shielded output, or null
     * when the payment carried no memo.
     */
    memoHash: Sha256HexSchema.nullable(),
  }),
  z.object({ ok: z.literal(false), refusal: SendRefusalSchema }),
]);
export type ConfirmSendResultType = z.infer<typeof ConfirmSendResultSchema>;

// SWARM addition (M3 wave 2) ----------------------------------------------------

export const SwarmChainSchema = z.enum(['swarm-mainnet', 'swarm-testnet']);

export const NewAddressResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    /** A new unified address of this wallet, for one conversation. */
    address: z.string(),
    chain: SwarmChainSchema,
  }),
  z.object({
    ok: z.literal(false),
    refusal: z.enum(['not-ready', 'offline', 'rejected']),
  }),
]);
export type NewAddressResultType = z.infer<typeof NewAddressResultSchema>;

export const CheckAddressResultSchema = z.object({
  /** Whether the wallet would pay this address on the network it is on. */
  accepted: z.boolean(),
  chain: SwarmChainSchema,
  /** The wallet's own sentence when it is refused; it names the network. */
  detail: z.string().nullable(),
});
export type CheckAddressResultType = z.infer<typeof CheckAddressResultSchema>;

/** Whether a memo in the wallet is the one a payment notice describes. */
export const MemoVerdictSchema = z.enum([
  /** The wallet has the memo, and its hash is the notice's. */
  'match',
  /** The wallet has a memo, and it is not the one the notice describes. */
  'mismatch',
  /** The notice names a memo, and the wallet has none it can read as text. */
  'unreadable',
  /** Neither has a memo. */
  'none',
]);
export type MemoVerdictType = z.infer<typeof MemoVerdictSchema>;

export const FindTransactionResultSchema = z.discriminatedUnion('status', [
  z.object({
    /** The wallet is not open or not answering yet; nothing can be said. */
    status: z.literal('wallet-not-ready'),
    chain: SwarmChainSchema,
    wallet: SwarmWalletStatusSchema,
  }),
  z.object({
    /** The wallet has not seen this transaction, as far as it has synced. */
    status: z.literal('not-found'),
    chain: SwarmChainSchema,
    syncedHeight: z.number().int().nonnegative().nullable(),
    serverHeight: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    status: z.literal('found'),
    chain: SwarmChainSchema,
    /** What this wallet received in it, zatoshi. */
    receivedZat: ZatoshiStringSchema,
    /** What this wallet sent in it to others, zatoshi. */
    sentZat: ZatoshiStringSchema,
    /** In a block, as the wallet reports it. */
    confirmed: z.boolean(),
    /** The network did not take it (a payment this wallet made). */
    failed: z.boolean(),
    blockHeight: z.number().int().nonnegative().nullable(),
    memo: MemoVerdictSchema,
    /** The memo as the wallet reads it, for the person to see. */
    memoText: z.string().nullable(),
  }),
]);
export type FindTransactionResultType = z.infer<
  typeof FindTransactionResultSchema
>;

/**
 * SWARM addition (B6, 2026-09-29): what the Wallet pane hears back when it
 * asks for the recovery phrase window. Never the words.
 */
export const RevealRecoveryPhraseResultSchema = z.discriminatedUnion('ok', [
  /** The window is open (or was already, and is brought forward). */
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    /**
     * `not-ready`: no wallet is open for this account. `not-confirmed`: Touch
     * ID or Windows Hello did not confirm the person, so nothing was opened.
     */
    refusal: z.enum(['not-ready', 'not-confirmed']),
  }),
]);
export type RevealRecoveryPhraseResultType = z.infer<
  typeof RevealRecoveryPhraseResultSchema
>;

/** Where a transaction can be looked up. Both explorers use /transactions/. */
export function explorerTransactionUrl(explorer: string, txid: string): string {
  return `${explorer}transactions/${txid}`;
}

// SWARM addition (PD-5, 2026-10-05): the SWM price ----------------------------
//
// The main process reads one JSON document from the SWARM price service
// (specs/PRICE-DISPLAY.md section 2.1, `schema: "swarm-price/1"`) and hands the
// pane what it needs to draw the price, never more. The renderer sends nothing
// but "show me" and the on/off switch: no address, no balance.

/**
 * A price in USD as a decimal string, never a float: "0.84114343". At most
 * twelve whole digits and eighteen decimals; zero is not a price.
 */
export const DecimalPriceSchema = z
  .string()
  .max(32)
  .regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,18})?$/)
  .refine(value => /[1-9]/.test(value), { message: 'not a positive price' });

/** The most hourly closes the pane draws (the service sends up to 48). */
export const SWARM_PRICE_SPARKLINE_MAX = 168;

/**
 * Whether a URL is a pool page on DexScreener: https, exactly the host
 * dexscreener.com, no credentials, no port, no query and no fragment. The
 * price card opens it in the system browser, so nothing else is accepted.
 */
export function isDexscreenerPoolUrl(value: string): boolean {
  if (value.length > 256) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname === 'dexscreener.com' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    url.origin === 'https://dexscreener.com' &&
    /^\/[a-z0-9-]{1,32}\/[A-Za-z0-9]{1,80}$/.test(url.pathname)
  );
}

const PercentSchema = z.number().min(-1_000_000).max(1_000_000);

/**
 * `schema`, or undefined when the value is missing or does not fit: for the
 * fields whose failure should cost only themselves, not the whole document.
 */
function droppedIfInvalid<T extends z.ZodType>(schema: T) {
  return z.unknown().transform(value => {
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  });
}

/** A short lowercase id such as `base`, `uniswap-v4` or `geckoterminal`. */
const SlugSchema = z.string().regex(/^[a-z0-9-]{1,32}$/);

/**
 * The price service's document, as far as a wallet reads it. Unknown fields are
 * dropped. A DexScreener URL that is not a DexScreener pool page is dropped
 * too (the card is then not a link); everything else that is wrong refuses the
 * whole document, and the last good reading stays.
 */
export const SwarmPriceRelaySchema = z.object({
  schema: z.literal('swarm-price/1'),
  symbol: z.literal('SWM'),
  quote: z.literal('USD'),
  price_usd: DecimalPriceSchema,
  change_pct: z
    .object({
      h1: PercentSchema.nullable().optional(),
      h6: PercentSchema.nullable().optional(),
      h24: PercentSchema.nullable().optional(),
    })
    .optional(),
  source: droppedIfInvalid(SlugSchema),
  sparkline_usd: z
    .array(z.number().nonnegative())
    .max(SWARM_PRICE_SPARKLINE_MAX)
    .optional(),
  pool: z
    .object({
      chain: droppedIfInvalid(SlugSchema),
      dex: droppedIfInvalid(SlugSchema),
      dexscreener_url: droppedIfInvalid(
        z.string().refine(isDexscreenerPoolUrl)
      ),
    })
    .optional(),
  generated_unix: z.number().int().positive(),
  stale: z.boolean(),
});
export type SwarmPriceRelayType = z.infer<typeof SwarmPriceRelaySchema>;

/** One reading of the price, as the pane is given it. */
export const SwarmPriceReadingSchema = z.object({
  priceUsd: DecimalPriceSchema,
  /** The 24-hour change in percent, as the service reports it. */
  changePct24h: PercentSchema.nullable(),
  /** Hourly closes in USD, oldest first; empty when the service sent none. */
  sparklineUsd: z
    .array(z.number().nonnegative())
    .max(SWARM_PRICE_SPARKLINE_MAX),
  /** The pool's page on DexScreener, or null. */
  dexscreenerUrl: z.string().refine(isDexscreenerPoolUrl).nullable(),
  chain: SlugSchema.nullable(),
  dex: SlugSchema.nullable(),
  /** Which aggregator the service took the price from. */
  source: SlugSchema.nullable(),
  /** When the service made the document, Unix seconds. */
  generatedUnix: z.number().int().positive(),
  /** The service itself says its sources have failed for a while. */
  relayStale: z.boolean(),
});
export type SwarmPriceReadingType = z.infer<typeof SwarmPriceReadingSchema>;

export const SwarmPriceStatusSchema = z.enum([
  /** "Show SWM price (USD)" is off: no requests, nothing shown. */
  'off',
  /** The wallet is not on SWARM Mainnet: no requests, nothing shown. */
  'not-mainnet',
  /** On, and no reading yet. */
  'waiting',
  /** Read less than 5 minutes ago. */
  'fresh',
  /** Read 5 to 30 minutes ago, or kept from the last run: "as of hh:mm". */
  'ageing',
  /** Read more than 30 minutes ago, or the service says it is stale. */
  'stale',
  /** No good reading for 60 minutes: "price unavailable". */
  'unavailable',
]);
export type SwarmPriceStatusType = z.infer<typeof SwarmPriceStatusSchema>;

/** What `swarm-wallet:price-get` and `price-set-enabled` answer. */
export const SwarmPriceStateSchema = z.object({
  status: SwarmPriceStatusSchema,
  /** The switch, default on. */
  enabled: z.boolean(),
  /** The reading to show; null when off, not mainnet, waiting or unavailable. */
  reading: SwarmPriceReadingSchema.nullable(),
  /** When this computer received the reading, epoch milliseconds. */
  fetchedAt: z.number().int().nonnegative().nullable(),
  /** Seconds since then, counted by the main process when it answered. */
  ageSeconds: z.number().int().nonnegative().nullable(),
});
export type SwarmPriceStateType = z.infer<typeof SwarmPriceStateSchema>;

/** `swarm-wallet:price-get` takes nothing. */
export const PriceGetRequestSchema = z.object({}).strict();

export const PriceSetEnabledRequestSchema = z
  .object({ enabled: z.boolean() })
  .strict();
