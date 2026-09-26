// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (M1): a mount point for the wallet, and nothing more. Opus M-C
// is building swarm-wallet-core; when it lands, this pane is where it goes. It is
// deliberately tiny so that replacing it is a small diff.

import type { JSX } from 'react';

import type { LocalizerType } from '../types/Util.std.ts';
import { tw } from '../axo/tw.dom.tsx';

export type SwarmWalletPaneProps = Readonly<{
  i18n: LocalizerType;
}>;

export function SwarmWalletPane({ i18n }: SwarmWalletPaneProps): JSX.Element {
  return (
    <div
      className={tw(
        'flex h-full w-full flex-col items-center justify-center gap-2 px-8 text-center'
      )}
    >
      <h1 className={tw('type-title-large text-primary')}>
        {i18n('icu:SwarmWallet__placeholder-title')}
      </h1>
      <p className={tw('type-body-medium text-secondary')}>
        {i18n('icu:SwarmWallet__placeholder-body')}
      </p>
    </div>
  );
}
