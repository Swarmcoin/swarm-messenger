// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (no phone number in the interface): a contact's title never
// falls back to its SWARM account identifier. It is the profile name, then the
// username, then the app's "Unknown" wording - and a real phone number is still
// treated the way Signal treats it.

import { assert } from 'chai';
import sinon from 'sinon';

import type { ConversationAttributesType } from '../../model-types.d.ts';
import {
  canHaveUsername,
  getNumber,
  getTitle,
  getTitleNoDefault,
  hasNumberTitle,
  hasUsernameTitle,
  renderNumber,
} from '../../util/getTitle.preload.ts';
import { filterAndSortConversations } from '../../util/filterAndSortConversations.std.ts';
import { findAndFormatContact } from '../../util/findAndFormatContact.preload.ts';
import {
  ContactFormType,
  embeddedContactSelector,
} from '../../types/EmbeddedContact.std.ts';
import { getDefaultConversation } from '../../test-helpers/getDefaultConversation.std.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { generateAci } from '../../test-helpers/serviceIdUtils.std.ts';

// A wallet sign-in test vector's identifier (walletIdentity_test).
const SWARM_NUMBER = '+88810866442360';
// A fictional number, to show that real numbers keep Signal's behaviour.
const REAL_NUMBER = '+12125550123';
const REAL_NUMBER_RENDERED = '+1 212-555-0123';

const OUR_CONVERSATION_ID = 'our-conversation-id';
const CONTACT_ACI = generateAci();

function contact(
  overrides: Partial<ConversationAttributesType>
): ConversationAttributesType {
  return {
    id: 'contact-id',
    type: 'private',
    version: 2,
    serviceId: CONTACT_ACI,
    // Without a profile key the app treats a known number as visible, which
    // is the case where Signal titles a contact by its number.
    e164: SWARM_NUMBER,
    ...overrides,
  } as ConversationAttributesType;
}

describe('SWARM: titles without the account identifier', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // No regionCode: numbers render in international form.
    sandbox.stub(itemStorage, 'get').returns(undefined);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('renders no SWARM account identifier', () => {
    assert.isUndefined(renderNumber(SWARM_NUMBER));
    assert.strictEqual(renderNumber(REAL_NUMBER), REAL_NUMBER_RENDERED);
  });

  it('a contact with only the identifier has no number and is "Unknown"', () => {
    const attributes = contact({});

    assert.isNotOk(getNumber(attributes));
    assert.isFalse(hasNumberTitle(attributes));
    assert.isUndefined(getTitleNoDefault(attributes));
    assert.strictEqual(getTitle(attributes), 'i18n(icu:unknownContact)');
  });

  it('... even when the contact shares its number', () => {
    const attributes = contact({
      profileKey: 'cHJvZmlsZSBrZXk=',
      sharingPhoneNumber: true,
    });

    assert.isNotOk(getNumber(attributes));
    assert.strictEqual(getTitle(attributes), 'i18n(icu:unknownContact)');
  });

  it('a contact with the identifier and a username is titled by the username', () => {
    const attributes = contact({ username: 'swarmbee.42' });

    assert.strictEqual(getTitle(attributes), 'swarmbee.42');
    assert.isTrue(canHaveUsername(attributes, OUR_CONVERSATION_ID));
    assert.isTrue(hasUsernameTitle(attributes));
    assert.isFalse(hasNumberTitle(attributes));
  });

  it('a contact with the identifier and a profile name is titled by the name', () => {
    const attributes = contact({
      profileName: 'Hive',
      profileFamilyName: 'Keeper',
      username: 'swarmbee.42',
    });

    assert.strictEqual(getTitle(attributes), 'Hive Keeper');
    assert.strictEqual(getTitle(attributes, { isShort: true }), 'Hive');
  });

  it('a real phone number is still a title, as in Signal', () => {
    const attributes = contact({ e164: REAL_NUMBER, username: 'swarmbee.42' });

    assert.strictEqual(getNumber(attributes), REAL_NUMBER_RENDERED);
    assert.strictEqual(getTitle(attributes), REAL_NUMBER_RENDERED);
    assert.isFalse(canHaveUsername(attributes, OUR_CONVERSATION_ID));
  });

  it('a lone identifier is never a title of its own', () => {
    const { ConversationController } = window;
    window.ConversationController = {
      get: () => undefined,
    } as unknown as typeof window.ConversationController;
    try {
      assert.strictEqual(
        findAndFormatContact(SWARM_NUMBER).title,
        'i18n(icu:unknownContact)'
      );
      assert.strictEqual(
        findAndFormatContact(REAL_NUMBER).title,
        REAL_NUMBER_RENDERED
      );
    } finally {
      window.ConversationController = ConversationController;
    }
  });
});

describe('SWARM: nobody is found by the account identifier', () => {
  it('searching the identifier finds nothing', () => {
    const conversations = [
      getDefaultConversation({
        title: 'swarmbee.42',
        titleNoDefault: 'swarmbee.42',
        e164: SWARM_NUMBER,
      }),
    ];

    for (const searchTerm of [SWARM_NUMBER, '10866442360', '108 664 42360']) {
      assert.deepEqual(
        filterAndSortConversations(conversations, searchTerm, 'US').map(
          convo => convo.title
        ),
        [],
        searchTerm
      );
    }
    assert.deepEqual(
      filterAndSortConversations(conversations, 'swarmbee', 'US').map(
        convo => convo.title
      ),
      ['swarmbee.42']
    );
  });

  it('a real number is still searchable, as in Signal', () => {
    const conversations = [
      getDefaultConversation({
        title: 'Somebody',
        titleNoDefault: 'Somebody',
        e164: REAL_NUMBER,
      }),
    ];

    assert.deepEqual(
      filterAndSortConversations(conversations, REAL_NUMBER, 'US').map(
        convo => convo.title
      ),
      ['Somebody']
    );
  });
});

describe('SWARM: contact cards', () => {
  it('drop the identifier and never use it to reach anyone', () => {
    const serviceId = generateAci();
    const card = embeddedContactSelector(
      {
        name: { givenName: 'Hive' },
        number: [
          { value: '+888 108 664 42360', type: ContactFormType.MOBILE },
          { value: REAL_NUMBER, type: ContactFormType.HOME },
        ],
      },
      { regionCode: 'US', firstNumber: '+888 108 664 42360', serviceId }
    );

    assert.deepEqual(
      card.number?.map(item => item.value),
      ['(212) 555-0123']
    );
    assert.isUndefined(card.firstNumber);
    assert.isUndefined(card.serviceId);
  });

  it('keep a real number as in Signal', () => {
    const serviceId = generateAci();
    const card = embeddedContactSelector(
      {
        name: { givenName: 'Hive' },
        number: [{ value: REAL_NUMBER, type: ContactFormType.HOME }],
      },
      { regionCode: 'US', firstNumber: REAL_NUMBER, serviceId }
    );

    assert.strictEqual(card.firstNumber, REAL_NUMBER);
    assert.strictEqual(card.serviceId, serviceId);
  });
});
