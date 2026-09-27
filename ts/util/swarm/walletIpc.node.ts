// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (M3 wave 1): the main process's half of the wallet's IPC
// surface, as pure functions so the tests can hold every rule in place.
//
// Everything the renderer sends is `unknown` until a function here has read it.
// The renderer is treated as a caller that may be wrong - a bug, an old build,
// a compromised page - so each value is parsed exactly once, here, and nothing
// the renderer says is used as a path, a server, a key or a chain.

import { createHash } from 'node:crypto';

import {
  SWARM_MAINNET_PROFILE,
  SWARM_TESTNET_PROFILE,
  checkAddressForProfile,
} from 'swarm-wallet-core';
import type { SwarmNetworkProfile } from 'swarm-wallet-core';

import { checkRecoveryPhrase } from './bip39.node.ts';
import { deriveWalletIdentity } from './walletIdentity.node.ts';
import { parseSwmAmount } from './swmAmount.std.ts';
import {
  ConfirmSendRequestSchema,
  GetStateRequestSchema,
  OpenWithPhraseRequestSchema,
  QuoteSendRequestSchema,
  SetNetworkRequestSchema,
} from '../../types/SwarmWallet.std.ts';
import type {
  SendRefusalKindType,
  SendRefusalType,
  SwarmWalletNetworkIdType,
  SwarmWalletNetworkType,
  SwarmWalletProblemType,
} from '../../types/SwarmWallet.std.ts';

// Networks ---------------------------------------------------------------------

export type SwarmWalletNetworkDefinitionType = Readonly<{
  profile: SwarmNetworkProfile;
  /** The block explorer; transactions are at `<explorer>transactions/<txid>`. */
  explorer: string;
}>;

/**
 * The two networks the pane can be on. The chain rules - address prefixes,
 * genesis, default light server - are swarm-wallet-core's; the explorers were
 * checked by hand on 2026-09-27: /transactions/<txid> answers 200 on both, and
 * /tx/<txid> answers 404 on both.
 */
export const SWARM_WALLET_NETWORKS: Readonly<
  Record<SwarmWalletNetworkIdType, SwarmWalletNetworkDefinitionType>
> = {
  mainnet: {
    profile: SWARM_MAINNET_PROFILE,
    explorer: 'https://mainnet.explore.swarm.green/',
  },
  testnet: {
    profile: SWARM_TESTNET_PROFILE,
    explorer: 'https://explore.swarm.green/',
  },
};

/** A light server URL a developer setting may point the wallet at, or undefined. */
export function parseServerOverride(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) {
      return undefined;
    }
    return `https://${url.host}`;
  } catch {
    return undefined;
  }
}

/** What the pane is told about the network, host:port and nothing more. */
export function describeNetwork(
  id: SwarmWalletNetworkIdType,
  server: string
): SwarmWalletNetworkType {
  const { profile, explorer } = SWARM_WALLET_NETWORKS[id];
  let host = server;
  try {
    const url = new URL(server);
    host = url.port ? `${url.hostname}:${url.port}` : `${url.hostname}:443`;
  } catch {
    // Leave it as given: it came from this process's own settings.
  }
  return { id, chain: profile.chainLabel, server: host, explorer };
}

// The account, and which wallet file is its -----------------------------------

const WALLET_FILE_LABEL = 'SWARM-Messenger-wallet-file-v1';

/**
 * The file name of an account's wallet, from the account's identity public
 * key: `wallet-<32 hex digits>.dat`. A digest rather than the key itself, so a
 * directory listing does not carry the key; per account, so one person's two
 * accounts on one computer never share a wallet file.
 */
export function walletFileNameFor(accountKey: Uint8Array<ArrayBuffer>): string {
  const digest = createHash('sha256')
    .update(WALLET_FILE_LABEL)
    .update(accountKey)
    .digest('hex');
  return `wallet-${digest.slice(0, 32)}.dat`;
}

/**
 * The account's ACI identity public key for a recovery phrase - the same
 * derivation sign-in used, so the same words always name the same account.
 */
export function accountKeyForPhrase(phrase: string): Uint8Array<ArrayBuffer> {
  return deriveWalletIdentity(phrase).aciKeyPair.publicKey.serialize();
}

export function accountKeyFromBase64(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export function sameAccountKey(
  a: Uint8Array<ArrayBuffer>,
  b: Uint8Array<ArrayBuffer>
): boolean {
  return a.length === b.length && Buffer.from(a).equals(Buffer.from(b));
}

// Requests ----------------------------------------------------------------------

export type GetStateInputType = Readonly<{
  accountKey: Uint8Array<ArrayBuffer> | undefined;
}>;

export function parseGetStateRequest(
  input: unknown
): GetStateInputType | undefined {
  const parsed = GetStateRequestSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return undefined;
  }
  return {
    accountKey:
      parsed.data.accountKey == null
        ? undefined
        : accountKeyFromBase64(parsed.data.accountKey),
  };
}

export type OpenWithPhraseInputType =
  | Readonly<{
      ok: true;
      phrase: string;
      isNewPhrase: boolean;
      accountKey: Uint8Array<ArrayBuffer>;
    }>
  | Readonly<{ ok: false; problem: SwarmWalletProblemType }>;

/**
 * A recovery phrase, checked, and the account it belongs to. When the renderer
 * names the account it expects, a phrase for any other account is refused:
 * the pane only ever opens the wallet of the account that is signed in.
 */
export function parseOpenWithPhraseRequest(
  input: unknown
): OpenWithPhraseInputType {
  const parsed = OpenWithPhraseRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, problem: 'invalid-phrase' };
  }
  const check = checkRecoveryPhrase(parsed.data.phrase);
  if (!check.valid) {
    return { ok: false, problem: 'invalid-phrase' };
  }
  const accountKey = accountKeyForPhrase(check.phrase);
  if (
    parsed.data.accountKey != null &&
    !sameAccountKey(accountKey, accountKeyFromBase64(parsed.data.accountKey))
  ) {
    return { ok: false, problem: 'wrong-phrase' };
  }
  return {
    ok: true,
    phrase: check.phrase,
    isNewPhrase: parsed.data.isNewPhrase,
    accountKey,
  };
}

/** The shielded memo field: 512 bytes of UTF-8. */
export const MEMO_MAX_BYTES = 512;

export type ValidSendType = Readonly<{
  to: string;
  amountZat: bigint;
  memo: string | null;
}>;

export type ValidatedSendType =
  | Readonly<{ ok: true; send: ValidSendType }>
  | Readonly<{ ok: false; refusal: SendRefusalType }>;

export function refusal(
  kind: SendRefusalKindType,
  {
    detail = null,
    needZat = null,
    haveZat = null,
  }: {
    detail?: string | null;
    needZat?: bigint | null;
    haveZat?: bigint | null;
  } = {}
): SendRefusalType {
  return {
    kind,
    detail,
    needZat: needZat == null ? null : needZat.toString(),
    haveZat: haveZat == null ? null : haveZat.toString(),
  };
}

/**
 * A payment as the renderer asked for it, checked against the network the
 * wallet is on and against what the wallet can spend.
 *
 * - the address must be this network's: a testnet `swarm1…` on mainnet, a
 *   Zcash `u1…`, a damaged checksum - each is refused with the wallet's own
 *   sentence saying which network the address belongs to;
 * - the amount is read as SWM text, exactly, into zatoshi;
 * - a memo is at most 512 bytes, and a transparent address cannot carry one;
 * - an amount above what is spendable is refused here, before any quote.
 *
 * `spendableZat` null means the wallet has not reported a balance yet.
 */
export function validateSendRequest(
  input: unknown,
  profile: SwarmNetworkProfile,
  spendableZat: bigint | null
): ValidatedSendType {
  const parsed = QuoteSendRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, refusal: refusal('rejected') };
  }

  const to = parsed.data.to.trim();
  const verdict = checkAddressForProfile(to, profile);
  if (!verdict.accepted) {
    return {
      ok: false,
      refusal: refusal('invalid-address', { detail: verdict.message }),
    };
  }

  const amount = parseSwmAmount(parsed.data.amount);
  if (!amount.ok) {
    return {
      ok: false,
      refusal: refusal('invalid-amount', { detail: amount.problem }),
    };
  }

  const memo =
    parsed.data.memo == null || parsed.data.memo === ''
      ? null
      : parsed.data.memo;
  if (memo != null) {
    if (Buffer.byteLength(memo, 'utf8') > MEMO_MAX_BYTES) {
      return {
        ok: false,
        refusal: refusal('invalid-memo', { detail: 'too-long' }),
      };
    }
    if (profile.transparentPrefixes.some(prefix => to.startsWith(prefix))) {
      return {
        ok: false,
        refusal: refusal('invalid-memo', { detail: 'transparent' }),
      };
    }
  }

  if (spendableZat == null) {
    return { ok: false, refusal: refusal('not-ready') };
  }
  if (amount.zatoshi > spendableZat) {
    return {
      ok: false,
      refusal: refusal('insufficient-funds', {
        needZat: amount.zatoshi,
        haveZat: spendableZat,
      }),
    };
  }

  return { ok: true, send: { to, amountZat: amount.zatoshi, memo } };
}

export function parseConfirmSendRequest(input: unknown): string | undefined {
  const parsed = ConfirmSendRequestSchema.safeParse(input);
  return parsed.success ? parsed.data.quoteId : undefined;
}

export function parseSetNetworkRequest(
  input: unknown
): SwarmWalletNetworkIdType | undefined {
  const parsed = SetNetworkRequestSchema.safeParse(input);
  return parsed.success ? parsed.data.network : undefined;
}

// Failures ------------------------------------------------------------------------

/** What an addon or wallet failure means, for the pane. */
export function classifyWalletFailure(
  code: string,
  message: string
): SwarmWalletProblemType {
  if (code === 'addon-missing') {
    return 'addon-missing';
  }
  if (code === 'wrong-chain') {
    return 'wrong-chain';
  }
  if (code === 'timeout' || isNetworkFailure(message)) {
    return 'offline';
  }
  if (code === 'wallet-file') {
    return 'wallet-file';
  }
  return 'unexpected';
}

/** Whether a failure is the light server not answering, in the addon's words. */
export function isNetworkFailure(message: string): boolean {
  return /transport error|tcp connect|dns error|timed? ?out|deadline|connection refused|forcibly closed|actively refused|unreachable|No connection could be made|os error 1006[01]|error trying to connect|broken pipe/i.test(
    message
  );
}

/** Whether the addon refused a payment because the wallet cannot cover it. */
export function isInsufficientFunds(message: string): boolean {
  return /insufficient|not enough (funds|balance)/i.test(message);
}

/**
 * A failure message with anything shaped like an address removed, for the log.
 * The rule for the whole wallet: no address in any log, because an address in
 * a debug log that is later shared links its owner to every payment to it.
 */
export function redactForLog(text: string): string {
  return (
    text
      // bech32 / bech32m: human-readable part, separator, 20+ data characters.
      .replace(/\b[a-z]{1,15}1[02-9ac-hj-np-z]{20,}\b/gi, '<address>')
      // Base58Check transparent addresses.
      .replace(/\b[st][13mM2][1-9A-HJ-NP-Za-km-z]{20,40}\b/g, '<address>')
  );
}
