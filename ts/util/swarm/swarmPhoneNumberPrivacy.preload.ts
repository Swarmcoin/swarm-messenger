// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (no phone number in the interface): a SWARM account's
// phone-number settings, held at their most private.
//
// A SWARM account's "number" is the identifier wallet sign-in derives (see
// swarmAccountNumber.std.ts). The interface no longer offers Signal's two
// settings about it, "Who can see my number" and "Who can find me by number",
// so they have to hold the values that are right for an identifier nobody
// should see or look up: Nobody and Nobody.
//
// What the app told the server before this change:
//  - finding: registration sends discoverableByPhoneNumber=false, but the
//    registration profile screen then stored the local setting as
//    "Discoverable". Settings > Privacy showed that as "Everyone", the storage
//    service carried it as unlistedPhoneNumber=false, and changing it in
//    Settings also told the server.
//  - seeing: the profile's phoneNumberSharing flag is 1 only while the local
//    setting is "Everybody"; unset means "Nobody".
// So, on every start of a SWARM account's primary device, whatever is not
// already the most private value becomes it: locally, on the server with the
// calls Settings > Privacy makes (PUT /v2/accounts/phone_number_discoverability;
// a profile write for the sharing flag), and in the storage service record. A
// value that is already right costs nothing, so in practice this runs once.

import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { setPhoneNumberDiscoverability } from '../../textsecure/WebAPI.preload.ts';
import { writeProfile } from '../../services/writeProfile.preload.ts';
import { createLogger } from '../../logging/log.std.ts';
import { toLogFormat } from '../../types/errors.std.ts';
import {
  PhoneNumberSharingMode,
  parsePhoneNumberSharingMode,
} from '../../types/PhoneNumberSharingMode.std.ts';
import { PhoneNumberDiscoverability } from '../phoneNumberDiscoverability.std.ts';
import { isSwarmAccountNumber } from './swarmAccountNumber.std.ts';

const log = createLogger('swarmPhoneNumberPrivacy');

export async function ensureSwarmPhoneNumberPrivacy(): Promise<void> {
  if (!isSwarmAccountNumber(itemStorage.user.getOptionalNumber())) {
    return;
  }
  // A linked device takes account settings from the primary device.
  if (!window.ConversationController.areWePrimaryDevice()) {
    return;
  }
  const ourConversation = window.ConversationController.getOurConversation();
  if (ourConversation == null) {
    return;
  }

  try {
    if (
      itemStorage.get('phoneNumberDiscoverability') !==
      PhoneNumberDiscoverability.NotDiscoverable
    ) {
      await setPhoneNumberDiscoverability(false);
      await itemStorage.put(
        'phoneNumberDiscoverability',
        PhoneNumberDiscoverability.NotDiscoverable
      );
      ourConversation.captureChange('phoneNumberDiscoverability');
      log.info('who can find me by number: now Nobody, on the server too');
    }

    if (
      parsePhoneNumberSharingMode(itemStorage.get('phoneNumberSharingMode')) !==
      PhoneNumberSharingMode.Nobody
    ) {
      await itemStorage.put(
        'phoneNumberSharingMode',
        PhoneNumberSharingMode.Nobody
      );
      ourConversation.captureChange('phoneNumberSharingMode');
      // After the setting, so that the profile carries the new flag.
      await writeProfile(ourConversation.format(), { keepAvatar: true });
      log.info('who can see my number: now Nobody, profile rewritten');
    }
  } catch (error) {
    log.warn('failed, trying again at the next start', toLogFormat(error));
  }
}
