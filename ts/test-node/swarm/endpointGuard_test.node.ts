// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (M1): tests for the startup guard, including the three config
// files themselves.

import { assert } from 'chai';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  describeLibsignalNetTarget,
  describeStartupRefusal,
  findPlaceholderParams,
  findSignalEndpoints,
  isSignalHost,
} from '../../util/swarm/endpointGuard.std.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');

function readConfig(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, 'config', name), 'utf8'));
}

const ENDPOINT_KEYS = [
  'serverUrl',
  'storageUrl',
  'contentProxyUrl',
  'sfuUrl',
  'challengeUrl',
  'registrationChallengeUrl',
  'updatesUrl',
  'resourcesUrl',
] as const;

describe('SWARM endpointGuard', () => {
  describe('isSignalHost', () => {
    it('recognises Signal hosts', () => {
      assert.isTrue(isSignalHost('https://chat.signal.org'));
      assert.isTrue(isSignalHost('https://chat.staging.signal.org'));
      assert.isTrue(isSignalHost('https://signalcaptchas.org/challenge'));
      assert.isTrue(isSignalHost('https://updates2.signal.org/desktop'));
      assert.isTrue(isSignalHost('http://contentproxy.signal.org:443'));
    });

    it('does not mistake a SWARM host for a Signal one', () => {
      assert.isFalse(isSignalHost('https://chat.swarm.green'));
      assert.isFalse(isSignalHost('https://cdn.chat.swarm.green'));
      assert.isFalse(isSignalHost('https://localhost:8080'));
    });

    it('is not fooled by a lookalike host', () => {
      assert.isFalse(isSignalHost('https://signal.org.example.com'));
      assert.isFalse(isSignalHost('https://notsignal.green'));
    });
  });

  describe('findSignalEndpoints', () => {
    it('reports every offending key', () => {
      const problems = findSignalEndpoints({
        serverUrl: 'https://chat.signal.org',
        storageUrl: 'https://storage.chat.swarm.green',
        challengeUrl: 'https://signalcaptchas.org/challenge/generate.html',
      });
      assert.lengthOf(problems, 2);
      assert.isTrue(problems.some(p => p.startsWith('serverUrl:')));
      assert.isTrue(problems.some(p => p.startsWith('challengeUrl:')));
    });

    it('is empty for a clean SWARM config', () => {
      assert.deepStrictEqual(
        findSignalEndpoints({
          serverUrl: 'https://chat.swarm.green',
          storageUrl: 'https://storage.chat.swarm.green',
        }),
        []
      );
    });
  });

  describe('findPlaceholderParams', () => {
    it('names each placeholder, including inside serverTrustRoots', () => {
      const problems = findPlaceholderParams({
        serverPublicParams: 'SWARM-PLACEHOLDER-serverPublicParams',
        genericServerPublicParams: 'AYhaw+Nbxt',
        serverTrustRoots: ['BbqY1Dzo', 'SWARM-PLACEHOLDER-serverTrustRoots'],
      });
      assert.deepStrictEqual(problems, [
        'serverPublicParams',
        'serverTrustRoots[1]',
      ]);
    });

    it('is empty once real values are wired in', () => {
      assert.deepStrictEqual(
        findPlaceholderParams({
          serverPublicParams: 'AByD8',
          genericServerPublicParams: 'AYhaw',
          backupServerPublicParams: 'AXYrGb',
          serverTrustRoots: ['BbqY1Dzo'],
        }),
        []
      );
    });
  });

  describe('describeLibsignalNetTarget', () => {
    it('knows the loopback test server', () => {
      assert.strictEqual(
        describeLibsignalNetTarget('https://localhost:8080'),
        'local-test-server'
      );
      assert.strictEqual(
        describeLibsignalNetTarget('https://127.0.0.1:8080'),
        'local-test-server'
      );
    });

    it('knows Signal', () => {
      assert.strictEqual(
        describeLibsignalNetTarget('https://chat.signal.org'),
        'signal-production'
      );
      assert.strictEqual(
        describeLibsignalNetTarget('https://chat.staging.signal.org'),
        'signal-staging'
      );
    });

    it('refuses to guess for a SWARM host', () => {
      // This is the finding that matters: libsignal-net has no custom
      // environment, and upstream fell through to Signal production here.
      assert.strictEqual(
        describeLibsignalNetTarget('https://chat.swarm.green'),
        'unsupported-custom-host'
      );
    });
  });

  describe('describeStartupRefusal', () => {
    it('says nothing when the build is fit to run', () => {
      assert.isUndefined(
        describeStartupRefusal({ signalEndpoints: [], placeholders: [] })
      );
    });

    it('names the Signal endpoints in plain language', () => {
      const message = describeStartupRefusal({
        signalEndpoints: ['serverUrl: https://chat.signal.org'],
        placeholders: [],
      });
      assert.include(message ?? '', 'SWARM Messenger cannot start.');
      assert.include(message ?? '', 'https://chat.signal.org');
      assert.include(message ?? '', 'docs/SWARM-CONFIG.md');
    });

    it('names the placeholders in plain language', () => {
      const message = describeStartupRefusal({
        signalEndpoints: [],
        placeholders: ['serverPublicParams'],
      });
      assert.include(message ?? '', 'serverPublicParams');
      assert.include(message ?? '', 'shared/staging-public-params.json');
    });
  });

  describe('the shipped config files', () => {
    for (const name of ['default.json', 'production.json', 'swarm-staging.json']) {
      it(`${name} points at no Signal endpoint`, () => {
        const config = readConfig(name);
        const cdn = (config.cdn ?? {}) as Record<string, string>;
        const problems = findSignalEndpoints({
          ...Object.fromEntries(
            ENDPOINT_KEYS.map(key => [key, config[key] as string | undefined])
          ),
          cdnUrl0: cdn['0'],
          cdnUrl2: cdn['2'],
          cdnUrl3: cdn['3'],
        });
        assert.deepStrictEqual(problems, []);
      });

      it(`${name} has no Stripe key and no update feed`, () => {
        const config = readConfig(name);
        assert.notProperty(config, 'stripePublishableKey');
        assert.notProperty(config, 'updatesPublicKey');
        assert.notProperty(config, 'appImageUpdatesPublicKey');
        if (name !== 'swarm-staging.json') {
          assert.strictEqual(config.updatesEnabled, false);
        }
      });
    }

    it('default.json and production.json match swarm-staging.json endpoint for endpoint', () => {
      const staging = readConfig('swarm-staging.json');
      for (const name of ['default.json', 'production.json']) {
        const other = readConfig(name);
        for (const key of ENDPOINT_KEYS) {
          assert.strictEqual(
            other[key],
            staging[key],
            `${name} ${key} must match config/swarm-staging.json`
          );
        }
        assert.deepStrictEqual(
          other.cdn,
          staging.cdn,
          `${name} cdn must match config/swarm-staging.json`
        );
      }
    });
  });
});
