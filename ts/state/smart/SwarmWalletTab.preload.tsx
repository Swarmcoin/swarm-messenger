// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (M1): container for the wallet pane. Opus M-C's
// swarm-wallet-core replaces the body of SwarmWalletPane; this file stays.

import { memo, type JSX } from 'react';
import { useSelector } from 'react-redux';

import { SwarmWalletPane } from '../../components/SwarmWalletPane.dom.tsx';
import { getIntl } from '../selectors/user.std.ts';

export const SmartSwarmWalletTab = memo(
  function SmartSwarmWalletTab(): JSX.Element {
    const i18n = useSelector(getIntl);
    return <SwarmWalletPane i18n={i18n} />;
  }
);
