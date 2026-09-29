// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (no phone number in the interface). A SWARM account is made
// from a wallet's 24 words, not from a telephone number, but the Signal account
// model still keys every account by a number in E.164 form. Wallet sign-in
// therefore derives one from the account's identity key: `accountIdentifierFor`
// in walletIdentity.node.ts, which the chat server's SwarmWalletIdentity
// matches byte for byte. It is `+888` - ITU-T's non-geographic code, which no
// telephone network dials - followed by a number from 10000000000 to
// 99999999999: always eleven digits, never a leading zero.
//
// That identifier stays exactly as it is in the protocol, the database and on
// the server. It is not a phone number, so the interface never shows it, never
// asks for it and never offers it as a way to find someone. This file is how
// the display layer recognises it. It looks at the shape only - precisely the
// shape the derivation produces - and knows nothing about keys.

/** `+888`, then eleven digits of which the first is not zero. */
const SWARM_ACCOUNT_NUMBER = /^\+888[1-9][0-9]{10}$/;

/**
 * What people and address books put between the digits of a number: spaces
 * (including the no-break and thin ones), dashes, dots and brackets.
 */
const NUMBER_FORMATTING = /[\s().\-‐-―]/g;

/** Whether an E.164 string is a SWARM account identifier (see above). */
export function isSwarmAccountNumber(e164: string | null | undefined): boolean {
  return typeof e164 === 'string' && SWARM_ACCOUNT_NUMBER.test(e164);
}

/**
 * The same test for a number written by a person or an address book, such as
 * one in a shared contact card: "+888 970 830 58418" counts. Only formatting
 * is ignored; everything else must still be exactly the identifier.
 */
export function looksLikeSwarmAccountNumber(
  text: string | null | undefined
): boolean {
  return (
    typeof text === 'string' &&
    isSwarmAccountNumber(text.replace(NUMBER_FORMATTING, ''))
  );
}
