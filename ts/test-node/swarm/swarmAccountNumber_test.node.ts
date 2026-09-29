// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (no phone number in the interface): the display layer's test
// for "is this a SWARM account identifier", held against the derivation that
// produces the identifiers (walletIdentity.node.ts) so that the two cannot
// drift apart.

import { assert } from 'chai';
import { PrivateKey } from '@signalapp/libsignal-client';

import {
  isSwarmAccountNumber,
  looksLikeSwarmAccountNumber,
} from '../../util/swarm/swarmAccountNumber.std.ts';
import {
  accountIdentifierFor,
  isSwarmAccountIdentifier,
} from '../../util/swarm/walletIdentity.node.ts';

// The identifiers of the wallet sign-in test vectors (walletIdentity_test).
const VECTOR_IDENTIFIERS = [
  '+88810866442360',
  '+88844571413476',
  '+88834279664637',
];

const LOWEST = '+88810000000000';
const HIGHEST = '+88899999999999';

const NOT_IDENTIFIERS = [
  '+88809999999999', // a leading zero: below the derivation's range
  '+8881000000000', // ten digits
  '+888100000000000', // twelve digits
  '88810000000000', // no plus
  '+88810000000000 ', // trailing space
  '+888 100 000 00000', // formatted: not E.164
  '+888', // the prefix alone
  '+12125550123', // real numbers
  '+4915112345678',
  '+447700900123',
  '+8881000000000a',
  '',
];

describe('SWARM account number (display rule)', () => {
  it('recognises the identifiers of the wallet sign-in vectors', () => {
    for (const identifier of VECTOR_IDENTIFIERS) {
      assert.isTrue(isSwarmAccountNumber(identifier), identifier);
    }
  });

  it('recognises every identifier the derivation produces', () => {
    for (let i = 0; i < 500; i += 1) {
      const identifier = accountIdentifierFor(
        PrivateKey.generate().getPublicKey()
      );
      assert.isTrue(isSwarmAccountNumber(identifier), identifier);
    }
  });

  it('covers exactly the derivation range: +888, then 10^10 to 10^11 - 1', () => {
    assert.isTrue(isSwarmAccountNumber(LOWEST));
    assert.isTrue(isSwarmAccountNumber(HIGHEST));
    for (const value of NOT_IDENTIFIERS) {
      assert.isFalse(isSwarmAccountNumber(value), JSON.stringify(value));
    }
  });

  it('agrees with the shape check wallet sign-in uses', () => {
    for (const value of [
      ...VECTOR_IDENTIFIERS,
      LOWEST,
      HIGHEST,
      ...NOT_IDENTIFIERS,
    ]) {
      assert.strictEqual(
        isSwarmAccountNumber(value),
        isSwarmAccountIdentifier(value),
        JSON.stringify(value)
      );
    }
  });

  it('is false for a missing value', () => {
    assert.isFalse(isSwarmAccountNumber(undefined));
    assert.isFalse(isSwarmAccountNumber(null));
  });

  describe('looksLikeSwarmAccountNumber (free text, e.g. a contact card)', () => {
    it('ignores spaces, dashes, dots and brackets', () => {
      for (const text of [
        '+888 108 664 42360',
        '+888-108-664-42360',
        '+888 (108) 664.42360',
        '+888 108 664 42360',
        '+888‑108‑664‑42360',
        '+88810866442360',
      ]) {
        assert.isTrue(looksLikeSwarmAccountNumber(text), JSON.stringify(text));
      }
    });

    it('still wants exactly the identifier', () => {
      for (const text of [
        '+888 108 664 4236', // ten digits
        '888 108 664 42360', // no plus
        '+888 008 664 42360', // leading zero
        '+1 212 555 0123',
        'call +888 108 664 42360',
        '',
        undefined,
        null,
      ]) {
        assert.isFalse(looksLikeSwarmAccountNumber(text), JSON.stringify(text));
      }
    });
  });
});
