// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';

import type { LocalizerType } from '../../types/Util.std.ts';
import { SystemMessage } from './SystemMessage.dom.tsx';
import { Emojify } from './Emojify.dom.tsx';
import { getStringForPhoneNumberDiscovery } from '../../util/getStringForPhoneNumberDiscovery.std.ts';
import {
  useSharedGroupNamesOnMount,
  type GetSharedGroupNamesType,
} from '../../util/sharedGroupNames.dom.ts';

export type PropsDataType = {
  conversationId: string;
  conversationTitle: string;
  // SWARM change (no phone number in the interface): absent when the number
  // is a SWARM account identifier, which is never shown.
  phoneNumber: string | undefined;
};
export type PropsType = PropsDataType & {
  getSharedGroupNames: GetSharedGroupNamesType;
  i18n: LocalizerType;
};

// Also known as a Session Switchover Event (SSE)
export function PhoneNumberDiscoveryNotification(
  props: PropsType
): JSX.Element | null {
  const {
    conversationId,
    conversationTitle,
    getSharedGroupNames,
    i18n,
    phoneNumber,
  } = props;

  const sharedGroupNames = useSharedGroupNamesOnMount(
    conversationId,
    getSharedGroupNames
  );
  const sharedGroup = sharedGroupNames[0];

  // SWARM change (no phone number in the interface): "{number} belongs to
  // {name}" has nothing to say without the number.
  if (phoneNumber == null) {
    return null;
  }

  const message = getStringForPhoneNumberDiscovery({
    conversationTitle,
    i18n,
    phoneNumber,
    sharedGroup,
  });

  return <SystemMessage icon="info" contents={<Emojify text={message} />} />;
}
