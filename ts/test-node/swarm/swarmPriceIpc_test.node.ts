// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (PD-5, 2026-10-05): the price channels and the gate they
// pass. What must hold: only the main window's top frame is answered (the
// rule every wallet channel uses, now a pure function); the price channels
// are registered through that gate and through nothing else; their payloads
// are exactly "nothing" and "{ enabled }"; the price service's URL is written
// in one file, which the renderer does not import, so nothing a window sends
// can choose where the price comes from.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assert } from 'chai';

import {
  isMainWindowSender,
  parsePriceGetRequest,
  parsePriceSetEnabledRequest,
} from '../../util/swarm/walletIpc.node.ts';
import type { MainWindowLikeType } from '../../util/swarm/walletIpc.node.ts';
import {
  SWARM_WALLET_CHANNEL,
  SwarmPriceStateSchema,
} from '../../types/SwarmWallet.std.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

function fakeWindow(destroyed = false): MainWindowLikeType & {
  webContents: { mainFrame: object };
} {
  return {
    isDestroyed: () => destroyed,
    webContents: { mainFrame: { frame: 'top' } },
  };
}

describe('SWARM price: the IPC gate (PD-5)', () => {
  describe('isMainWindowSender', () => {
    it('answers the main window’s top frame', () => {
      const window = fakeWindow();
      assert.isTrue(
        isMainWindowSender(
          {
            sender: window.webContents,
            senderFrame: window.webContents.mainFrame,
          },
          window
        )
      );
    });

    it('refuses a subframe of the main window', () => {
      const window = fakeWindow();
      assert.isFalse(
        isMainWindowSender(
          { sender: window.webContents, senderFrame: { frame: 'iframe' } },
          window
        )
      );
    });

    it('refuses every other window', () => {
      const window = fakeWindow();
      const other = fakeWindow();
      assert.isFalse(
        isMainWindowSender(
          {
            sender: other.webContents,
            senderFrame: other.webContents.mainFrame,
          },
          window
        )
      );
      // Another window's contents with the main window's frame object: no.
      assert.isFalse(
        isMainWindowSender(
          {
            sender: other.webContents,
            senderFrame: window.webContents.mainFrame,
          },
          window
        )
      );
    });

    it('refuses everybody when there is no main window, or it is closed', () => {
      const window = fakeWindow(true);
      const event = {
        sender: window.webContents,
        senderFrame: window.webContents.mainFrame,
      };
      assert.isFalse(isMainWindowSender(event, window));
      assert.isFalse(isMainWindowSender(event, undefined));
    });
  });

  describe('the payloads', () => {
    it('price-get takes nothing', () => {
      assert.isTrue(parsePriceGetRequest(undefined));
      assert.isTrue(parsePriceGetRequest({}));
      assert.isFalse(parsePriceGetRequest({ url: 'https://evil.example/' }));
      assert.isFalse(parsePriceGetRequest({ address: 'swm1…' }));
      assert.isFalse(parsePriceGetRequest('x'));
    });

    it('price-set-enabled takes exactly { enabled }', () => {
      assert.isTrue(parsePriceSetEnabledRequest({ enabled: true }));
      assert.isFalse(parsePriceSetEnabledRequest({ enabled: false }));
      for (const bad of [
        undefined,
        {},
        { enabled: 'true' },
        { enabled: 1 },
        { enabled: true, url: 'https://evil.example/' },
        true,
      ]) {
        assert.isUndefined(
          parsePriceSetEnabledRequest(bad),
          JSON.stringify(bad)
        );
      }
    });

    it('the channels are wallet channels', () => {
      assert.strictEqual(
        SWARM_WALLET_CHANNEL.priceGet,
        'swarm-wallet:price-get'
      );
      assert.strictEqual(
        SWARM_WALLET_CHANNEL.priceSetEnabled,
        'swarm-wallet:price-set-enabled'
      );
    });

    it('the answer carries no wallet data', () => {
      const keys = Object.keys(SwarmPriceStateSchema.shape).sort();
      assert.deepEqual(keys, [
        'ageSeconds',
        'enabled',
        'fetchedAt',
        'reading',
        'status',
      ]);
    });
  });

  describe('where it is wired', () => {
    const service = read('app/SwarmWalletService.main.ts');

    it('registers every channel through the one sender gate', () => {
      // One ipcMain.handle in the service: the one inside #handle, which
      // checks isMainWindowSender before any work.
      assert.lengthOf(service.match(/ipcMain\.handle\(/g) ?? [], 1);
      assert.match(
        service,
        /#handle\(channel: string[\s\S]{0,200}ipcMain\.handle\(channel[\s\S]{0,120}if \(!this\.#isMainWindow\(event\)\)/
      );
      assert.include(
        service,
        'return isMainWindowSender(event, this.#getMainWindow());'
      );
      assert.include(service, 'this.#handle(SWARM_WALLET_CHANNEL.priceGet,');
      assert.include(
        service,
        'this.#handle(SWARM_WALLET_CHANNEL.priceSetEnabled,'
      );
    });

    it('asks only for SWARM Mainnet, and keeps the switch in config', () => {
      assert.include(service, "isMainnet: () => this.#network === 'mainnet',");
      assert.include(
        service,
        "const SHOW_PRICE_CONFIG_NAME = 'swarmShowPrice';"
      );
      assert.include(
        service,
        'isEnabled: () => userConfig.get(SHOW_PRICE_CONFIG_NAME) !== false,'
      );
    });

    it('writes the price service URL in one main-side file only', () => {
      const url = 'https://wallet.swarm.green/api/price/swm';
      assert.include(read('ts/util/swarm/swarmPriceRelay.std.ts'), url);
      for (const file of [
        'app/SwarmWalletService.main.ts',
        'ts/services/swarmWallet.preload.ts',
        'ts/state/smart/SwarmWalletTab.preload.tsx',
        'ts/components/SwarmWalletPane.dom.tsx',
        'ts/components/SwarmPrice.dom.tsx',
        'ts/components/SwarmSendFlow.dom.tsx',
      ]) {
        const text = read(file);
        assert.notInclude(text, 'api/price', file);
        if (file !== 'app/SwarmWalletService.main.ts') {
          assert.notInclude(text, 'swarmPriceRelay', file);
        }
      }
    });

    it('the renderer sends nothing but the request and the switch', () => {
      const client = read('ts/services/swarmWallet.preload.ts');
      assert.match(
        client,
        /ipcRenderer\.invoke\(\s*SWARM_WALLET_CHANNEL\.priceGet,\s*\{\}\s*\)/
      );
      assert.match(
        client,
        /ipcRenderer\.invoke\(\s*SWARM_WALLET_CHANNEL\.priceSetEnabled,\s*\{ enabled \}\s*\)/
      );
    });
  });
});
