// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (no phone number in the interface): the name of this device.
//
// Signal names a desktop when a phone links it, and only the phone can rename
// it; Settings > General shows the name read-only and says to open the app on
// the phone. A SWARM account is created on the desktop from its 24 words, so
// the desktop is the account's primary device: it is never linked, it never
// got a name, and there is no phone to rename it from.
//
// Nothing is added to the protocol. The desktop names itself the way a linked
// desktop already uploads its own name (AccountManager.maybeUpdateDeviceName):
// encrypted to the account's identity key and sent with libsignal's
// setDeviceName (PUT /v1/accounts/name), which the chat server allows a
// primary device to do for itself.

import { Base64 } from '@signalapp/types';

import { accountManager } from '../../textsecure/AccountManager.preload.ts';
import { updateDeviceName } from '../../textsecure/WebAPI.preload.ts';
import { signalProtocolStore } from '../../SignalProtocolStore.preload.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { createLogger } from '../../logging/log.std.ts';
import { toLogFormat } from '../../types/errors.std.ts';
import { strictAssert } from '../assert.std.ts';
import OS from '../os/osMain.node.ts';

const log = createLogger('swarmDeviceName');

/**
 * Names this device: on the server first, encrypted, then here. Throws when
 * the server cannot be reached or refuses, and then nothing has changed.
 */
export async function setThisDeviceName(name: string): Promise<void> {
  const trimmed = name.trim();
  strictAssert(trimmed.length > 0, 'setThisDeviceName: the name is empty');

  const identityKeyPair = signalProtocolStore.getIdentityKeyPair(
    itemStorage.user.getCheckedAci()
  );
  strictAssert(
    identityKeyPair !== undefined,
    'setThisDeviceName: no identity key pair'
  );
  const encryptedName = accountManager.encryptDeviceName(
    trimmed,
    identityKeyPair
  );
  strictAssert(encryptedName !== undefined, 'setThisDeviceName: no name');

  await updateDeviceName({
    deviceId: itemStorage.user.getCheckedDeviceId(),
    encryptedName: Base64.toBytes(encryptedName),
  });
  await itemStorage.user.setDeviceName(trimmed);
  await itemStorage.user.setDeviceNameEncrypted();
  window.Whisper.events.emit('deviceNameChanged');
}

/**
 * On every start: a primary device that has no name yet gets the name Signal
 * Desktop gives a desktop when it is linked, the operating system's
 * ("Windows", "macOS", "Linux"). Tried again at the next start if the server
 * cannot be reached.
 */
export async function maybeNameThisPrimaryDevice(): Promise<void> {
  if (!window.ConversationController.areWePrimaryDevice()) {
    return;
  }
  if (itemStorage.user.getDeviceName()) {
    return;
  }

  try {
    await setThisDeviceName(OS.getName());
    log.info('maybeNameThisPrimaryDevice: this device has a name now');
  } catch (error) {
    log.warn(
      'maybeNameThisPrimaryDevice: failed, trying again at the next start',
      toLogFormat(error)
    );
  }
}
