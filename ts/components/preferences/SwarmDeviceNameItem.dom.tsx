// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (no phone number in the interface): Settings > General >
// Device Name. Signal shows a desktop's name read-only, with a hint to rename
// the desktop from the phone it is linked to. A SWARM desktop is its account's
// primary device and names itself (util/swarm/swarmDeviceName.preload.ts), so
// the name is changed here and there is no hint.

import { useCallback, useState, type JSX } from 'react';

import type { LocalizerType } from '../../types/Util.std.ts';
import { AxoDialog } from '../../axo/AxoDialog.dom.tsx';
import { AxoItem } from '../../axo/items/AxoItem.dom.tsx';
import { AxoTextField } from '../../axo/fields/AxoTextField.dom.tsx';
import { tw } from '../../axo/tw.dom.tsx';
import { drop } from '../../util/drop.std.ts';

/**
 * What a typed name may be. The server takes at most 225 bytes of encrypted
 * name, and the encryption adds about 55.
 */
const MAX_GRAPHEMES = 50;
const MAX_BYTES = 150;

export type SwarmDeviceNameItemProps = Readonly<{
  i18n: LocalizerType;
  deviceName: string | undefined;
  /**
   * Saves a new name; rejects when it could not be saved. Without it the name
   * is only shown.
   */
  onDeviceNameChange?: (name: string) => Promise<void>;
}>;

export function SwarmDeviceNameItem({
  i18n,
  deviceName,
  onDeviceNameChange,
}: SwarmDeviceNameItemProps): JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  const startEditing = useCallback(() => {
    setDraft(deviceName ?? '');
    setHasFailed(false);
    setIsEditing(true);
  }, [deviceName]);

  const stopEditing = useCallback(() => {
    if (!isSaving) {
      setIsEditing(false);
    }
  }, [isSaving]);

  const trimmed = draft.trim();
  const canSave =
    onDeviceNameChange != null && trimmed.length > 0 && trimmed !== deviceName;

  const save = useCallback(() => {
    if (onDeviceNameChange == null || !canSave || isSaving) {
      return;
    }
    setIsSaving(true);
    setHasFailed(false);
    drop(
      (async () => {
        try {
          await onDeviceNameChange(trimmed);
          setIsEditing(false);
        } catch {
          setHasFailed(true);
        }
        setIsSaving(false);
      })()
    );
  }, [canSave, isSaving, onDeviceNameChange, trimmed]);

  return (
    <>
      <AxoItem.Root>
        <AxoItem.Content>
          <AxoItem.Label>{i18n('icu:Preferences--device-name')}</AxoItem.Label>
          {deviceName ? <AxoItem.Value>{deviceName}</AxoItem.Value> : null}
          {onDeviceNameChange != null && (
            <AxoItem.Accessory>
              <AxoItem.Action variant="subtle-secondary" onClick={startEditing}>
                {i18n('icu:edit')}
              </AxoItem.Action>
            </AxoItem.Accessory>
          )}
        </AxoItem.Content>
      </AxoItem.Root>
      <AxoDialog.Root
        open={isEditing}
        onOpenChange={open => {
          if (!open) {
            stopEditing();
          }
        }}
      >
        <AxoDialog.Content size="sm" escape="cancel-is-noop">
          <AxoDialog.Header>
            <AxoDialog.Title>
              {i18n('icu:Preferences--device-name')}
            </AxoDialog.Title>
            <AxoDialog.Close />
          </AxoDialog.Header>
          <AxoDialog.Body>
            <div className={tw('mt-2 mb-4')}>
              <AxoTextField.Root disabled={isSaving}>
                <AxoTextField.Input
                  placeholder={i18n('icu:Preferences--device-name')}
                  value={draft}
                  onValueChange={value => {
                    setDraft(value);
                    setHasFailed(false);
                  }}
                  maxGraphemes={MAX_GRAPHEMES}
                  maxBytes={MAX_BYTES}
                  showCount
                />
              </AxoTextField.Root>
            </div>
            {hasFailed && (
              <p className={tw('mb-4 type-body-small text-destructive')}>
                {i18n('icu:SwarmPreferences__DeviceName--save-failed')}
              </p>
            )}
          </AxoDialog.Body>
          <AxoDialog.Footer>
            <AxoDialog.Actions>
              <AxoDialog.Action
                variant="strong-secondary"
                disabled={isSaving}
                onClick={stopEditing}
              >
                {i18n('icu:cancel')}
              </AxoDialog.Action>
              <AxoDialog.Action
                variant="strong-primary"
                pending={isSaving}
                disabled={!canSave}
                onClick={save}
              >
                {i18n('icu:save')}
              </AxoDialog.Action>
            </AxoDialog.Actions>
          </AxoDialog.Footer>
        </AxoDialog.Content>
      </AxoDialog.Root>
    </>
  );
}
