# SWARM Messenger — every change from upstream Signal Desktop

Upstream base: `abe80d32445e53b047b42d10c5b751c4fbfbbfc0` = `v8.31.0-alpha.1`,
preserved on branch `upstream-main` and tag `upstream-abe80d3` in
`Swarm-Official/swarm-messenger`. Work happens on `swarm-main`, so every change
below is `git diff upstream-abe80d3..swarm-main`.

Milestone M1, 2026-09-26, Opus M-A.

**Nothing cryptographic was changed.** `@signalapp/libsignal-client` 0.101.2 is the
unmodified npm package. No primitive, key schedule or wire format was touched.

---

## 1. Making the tree build on a Windows box without Visual Studio

The build workstation has no Visual Studio and cannot get one (system drive full),
and `node-gyp` refuses to configure without it. Three of the four failures were
for work that does not need to happen on Windows at all.

| File | Change | Why |
|---|---|---|
| `packages/mute-state-change/scripts/swarm-install.mjs` (new), `packages/mute-state-change/package.json` | An `install` script that runs `node-gyp` only on macOS. | The addon is macOS-only. Its `binding.gyp` declares an empty `noop` target elsewhere, but node-gyp's *configure* step still demanded MSVC — for a target that compiles nothing. |
| `packages/windows-ucv/scripts/swarm-install.mjs` (new), `packages/windows-ucv/package.json` | An `install` script that reports a failed native build loudly and continues **only** when `SWARM_ALLOW_MISSING_NATIVE=1`. | Windows Hello re-authentication genuinely needs MSVC. CI never sets the variable, so a release build still fails if the addon cannot be built. |
| `packages/windows-ucv/index.ts` | `loadBinding()` wrapped in try/catch; new `isAvailable()` and `getLoadError()`. | Upstream threw at *import* time when the `.node` file was missing, which killed the main process. |
| `ts/util/os/promptOSAuthMain.main.ts` | `checkAvailability()` wrapped in try/catch → returns `'unsupported'`. | Same outcome as a PC with no Windows Hello device, instead of an unhandled rejection. |
| `scripts/swarm-install-app-deps.mjs` (new), `package.json` (`electron:install-app-deps`) | Wrapper around `electron-builder install-app-deps` with the same `SWARM_ALLOW_MISSING_NATIVE=1` escape hatch. | `@electron/rebuild` invokes node-gyp directly, bypassing the package `install` scripts above. |

Every native dependency that actually ships uses a prebuilt binary:
`@signalapp/libsignal-client` 0.101.2, `@signalapp/sqlcipher` 4.1.0 (node-gyp-build),
`@signalapp/ringrtc` 2.72.0 (downloads a prebuild),
`@indutny/simple-windows-notifications`. None of them needed a compiler.

## 2. Endpoints — never Signal, only SWARM

| File | Change |
|---|---|
| `config/swarm-staging.json` (new) | The canonical SWARM endpoint set, and the four server-generated values as clearly labelled `SWARM-PLACEHOLDER-*` strings. |
| `config/default.json` | Rewritten. Every Signal staging endpoint replaced; Signal's zk parameters, trust roots, pinned CA, update feed, update signing keys and Stripe test key removed. |
| `config/production.json` | Rewritten the same way (this is the file a packaged app uses). |
| `ts/types/RendererConfig.std.ts` | `certificateAuthority` and `stripePublishableKey` made optional. |
| `app/main.main.ts` | Reads those two with `config.has()` so an absent key means "use the system CA store" / "no donations". |
| `ts/util/createHTTPSAgent.node.ts` | `HOST_LOG_ALLOWLIST` is now the SWARM hosts. |
| `ts/services/networkObserver.preload.ts` | Outage DNS probe moved from `uptime.signal.org` to `uptime.swarm.green`. |
| `scripts/generate-dns-fallback.mjs`, `build/dns-fallback.json` | Domain list is the SWARM hosts; the shipped fallback file is now `[]`. It previously shipped Signal's hard-coded IP addresses, which the app would have used if DNS failed. Regenerate once the SWARM hosts resolve. |
| `app/updateDefaultSession.main.ts` | Spellchecker dictionary host moved off `updates.signal.org`. Dictionaries will not download until someone mirrors them — open item. |
| `ts/types/support.std.ts`, `ts/util/createSupportUrl.std.ts`, `ts/util/contactSupport.dom.tsx`, `app/main.main.ts` (`openForums`) and ~30 components | All Signal support / download / community URLs now point at `https://swarm.green/support`. |

See [`SWARM-CONFIG.md`](SWARM-CONFIG.md) for the endpoint table, the placeholder
procedure and the libsignal-net limitation.

### 2a. The libsignal-net finding

`ts/textsecure/preconnect.preload.ts` — `resolveLibsignalNet()` previously fell
through to `Net.Environment.Production` for any hostname it did not recognise.
`libsignal-client` 0.101.2 offers only Signal staging, Signal production and a
loopback test server, so a SWARM hostname would have sent chat and registration
traffic to **Signal's production servers**. It now refuses, with a message saying
what has to change. `getLibsignalNet()` returns a throwing proxy in that case so
the app still starts and shows its window — the refusal surfaces when something
actually touches the network. `SWARM-CONFIG.md` names the one place to change when
Opus M-D's SWARM environment lands.

### 2b. Startup guard

`app/swarmStartupGuard.main.ts` (new), called from `app.on('ready')` in
`app/main.main.ts` before any window opens:

- any configured endpoint on a Signal host → dialog + exit, **no override**;
- any `SWARM-PLACEHOLDER-*` value still present → dialog + exit, overridable with
  `SWARM_ALLOW_PLACEHOLDER_CONFIG=1` on an **unpackaged** tree only, so no
  installer can bypass it.

The decision logic is pure functions in `ts/util/swarm/endpointGuard.std.ts`,
tested in `ts/test-node/swarm/endpointGuard_test.node.ts`.

### 2c. The scan test

`ts/test-node/swarm/noSignalEndpoints_test.node.ts` walks `config/`, `ts/` and
`app/` and fails on `signal.org`, `signalcaptchas.org` or `whispersystems` outside:
licence headers, the AGPL attribution, the endpoint guard (which lists Signal's
domains so it can refuse them), and `ts/util/signalRoutes.std.ts` (see §7). It runs
as part of `pnpm run test-node`.

## 3. Standalone (phone-number) registration reachable

Phase 1 of the plan keeps phone-number identity exactly as upstream. What changed
is that it is reachable in a SWARM build, not only under `NODE_ENV=development`.

| File | Change |
|---|---|
| `ts/state/ducks/app.preload.ts` | `openStandalone()` no longer refuses in packaged builds. Added `useAppActions()`. |
| `app/menu.std.ts` | "Create account on this computer" is always in the File menu, not only in development. |
| `ts/components/installScreen/InstallScreenQrCodeNotScannedStep.dom.tsx` | A "Create account on this computer" button next to the linking QR code — the first-run choice. New prop `openStandalone`. |
| `ts/state/smart/InstallScreen.preload.tsx` | Wires that prop. |

### Captcha — what upstream actually does

The brief said upstream already handles a server that asks for no captcha. **It
does not.** `ts/textsecure/WebAPI.preload.ts` `createVerificationSession()` threw
`'Expected captcha requirement'` when the server did not request a captcha, and the
registration flow always went `PHONE_NUMBER → CAPTCHA → VERIFICATION_CODE`.

Changed:

- `createVerificationSession()` now returns `{ sessionId, captchaRequired }`
  instead of throwing.
- `ts/state/ducks/standaloneInstaller.preload.ts` `moveToCaptchaStage()` skips
  straight to the verification code when `captchaRequired` is false. The shared
  tail of both paths was extracted into `proceedToVerificationCode()`, so the
  captcha and no-captcha routes request the code identically.

The challenge URLs point at `https://chat.swarm.green/challenge/...`, so the
captcha step works if the SWARM server does serve one.

## 4. Rebrand

| Area | Files |
|---|---|
| Product identity | `package.json`: `name` `swarm-messenger`, `productName` `SWARM Messenger`, author SWARM, `build.appId` `green.swarm.messenger`, Linux `executableName`/`StartupWMClass` `swarm-messenger`. `app/startup_config.main.ts`: Windows AUMID `green.swarm.messenger`. |
| Strings | `_locales/en/messages.json`, swept by `scripts/swarm-rebrand-locale.mjs` (200 strings). The script is idempotent and re-runnable after an upstream merge. |
| About window | `ts/components/About.dom.tsx`: swarm.green links, and the AGPL attribution via the new `icu:SwarmAbout__attribution`. |
| Icons | `build/icons/win/icon.ico`, `build/icons/png/*` from `D:\privacy\brand\swarm-mark\dist`. Window/tray icons: `images/swarm-mark.svg`, `images/swarm-lockup.svg`, `images/swarm-lockup-with-text.svg`, `images/swarm-logo-desktop-linux.png`, `images/swarm-login.svg`, `images/swarm-heart.svg`, `images/app-icon-with-error.png`, and `images/tray-icons/**` regenerated as `swarm-tray-icon-*` by `pnpm run build:tray-icons`. References updated in `background.html`, `stylesheets/_modules.scss`, `stylesheets/components/InstallScreenSignalLogo.scss`, `stylesheets/components/PreferencesDonations.scss` and the components that used them. |
| Type | `fonts/swarm/` (Sora, Manrope, JetBrains Mono — latin and latin-ext subsets of the variable fonts, SIL OFL 1.1), registered in `stylesheets/_swarm-fontfaces.scss`, imported from `stylesheets/manifest.scss`. Stacks updated in `stylesheets/_variables.scss` (`$inter` now starts with Manrope, new `$swarm-display`, `$monospace` starts with JetBrains Mono) and `ts/axo/_tailwind-theme/fonts.css` (`--font-sans`, `--font-mono`, new `--font-display`). Inter is kept as a fallback so no glyph is lost. |
| Colour | Hive Orange `#FF8A1F` replaces Signal ultramarine: `stylesheets/_variables.scss` (`$color-accent-blue`, the `$color-ultramarine*` scale) and `ts/axo/_tailwind-theme/colors.css` (`--axo-color-brand-primary`). |
| Theme | Dark by default: `app/main.main.ts` `getThemeSetting()` and `ts/util/createIPCEvents.preload.ts`. The user can still choose. |
| polkit | `build/policy-templates/green.swarm.*.policy` replace `org.signalapp.*`; ids updated in `scripts/gen-policy-files.mjs`, `scripts/ensure-linux-file-permissions.mjs`, `ts/util/os/promptOSAuthMain.main.ts`, and `package.json` (`linux.extraResources` filter). |
| Sticker creator | `sticker-creator/package.json`, `sticker-creator/src/elements/PageHeader.tsx`: SWARM author and support link. The creator itself is a local page (`file://`), not a Signal service. |

### Removed or hidden

| What | How |
|---|---|
| Donations / boost | Settings entry point removed (`ts/components/Preferences.dom.tsx`). The page is left in the tree so upstream merges stay small. `stripePublishableKey` gone from config; the two Stripe calls in `ts/textsecure/WebAPI.preload.ts` throw a plain message if reached. |
| Update checks | `updatesEnabled: false` everywhere, all `publish` targets emptied, Signal's custom NSIS mirror (`nsis.customNsisBinary`, `customNsisResources` — they downloaded from `updates.signal.org`) removed, `updatesPublicKey` and `appImageUpdatesPublicKey` removed. "Force update" removed from the View menu (`app/menu.std.ts`). `ts/updater/common.main.ts` and `ts/updater/linuxAppImage.main.ts` now explain themselves if the missing key is ever read. |
| Windows signing with Signal's certificate | `build.win.signtoolOptions` reduced to the hook and hash algorithm; `certificateSubjectName`, `certificateSha1` and `publisherName` removed. `scripts/sign-windows.mjs` already returns early without a certificate, so builds are unsigned. |
| Signal support and community links | All point at `https://swarm.green/support`. |

### The brand check

`scripts/swarm-brand-check.mjs` unpacks the built `app.asar` and **fails** on:

- any Signal domain in the app's own files (excluding `node_modules`, licences,
  `ACKNOWLEDGMENTS.md`, `NOTICE-SWARM.md`);
- any packaged English string containing "Signal", except the AGPL attribution.

It **reports without failing** the internal mentions — `window.SignalContext`,
`X-Signal-Agent`, `SignalSymbols`, the `@signalapp/*` package names, the
`signal.me`/`signal.group` deep-link vocabulary. Those are identifiers and
protocol-level names, not branding, and a check that failed on them would be
useless. It runs in CI against the artefact, because the wallet team's W-2 miss was
exactly a rebrand that looked finished in the source tree.

## 5. Wallet mount point

Deliberately tiny, so Opus M-C's `swarm-wallet-core` replaces it in a small diff.

- `ts/types/Nav.std.ts`: `NavTab.Wallet`.
- `ts/components/SwarmWalletPane.dom.tsx` (new): "Wallet arrives in the next build".
- `ts/state/smart/SwarmWalletTab.preload.tsx` (new): the container.
- `ts/components/NavTabs.dom.tsx`, `ts/state/smart/NavTabs.preload.tsx`,
  `ts/components/Inbox.dom.tsx`, `ts/state/smart/Inbox.preload.tsx`: the
  `renderWalletTab` prop.
- `stylesheets/components/NavTabs.scss`: `.NavTabs__ItemIcon--Wallet`.

## 6. CI

`.github/workflows/swarm-build.yml` (new). Upstream `ci.yml` is untouched: it
targets Signal's self-hosted runners (`ubuntu-22.04-8-cores`,
`windows-latest-8-cores`) which do not exist in this org.

- `lint-and-test` on `ubuntu-latest`: install, generate, `check:types`, `oxlint:ci`,
  `lint-prettier`, `test-node`.
- `windows-installer` on `windows-latest`: install (**without**
  `SWARM_ALLOW_MISSING_NATIVE`, so a native failure fails the build), generate,
  `test-node`, `build:release --publish=never`, `swarm-brand-check.mjs`, sha256.
- The installer and `SHA256SUMS.txt` are attached to a GitHub Release tagged
  `swarm-messenger-m1-<shortsha>`. `actions/upload-artifact` is
  `continue-on-error: true` because the org's Actions artifact storage quota is
  exhausted; the Release is the deliverable.

`check:types` runs on Linux only, as upstream does: `fs-xattr` is an optional
non-Windows dependency and `ts/windows/main/attachments.preload.ts` imports its
types, so `tsc` reports one unresolved module on a Windows machine. That error is
pre-existing and unrelated to any SWARM change.

## 7. Deliberately *not* changed

| Thing | Why |
|---|---|
| `ts/util/signalRoutes.std.ts` — `signal.me`, `signal.group`, `signal.link`, `signal.art` and the `sgnl:` / `signalcaptcha:` URL schemes | These are the deep-link vocabulary shared between clients and the server, not branding, and nothing is *fetched* from those hosts (the app intercepts them). Removing `sgnl:` breaks device linking outright. Renaming them to `swarm:` needs one coordinated change across Signal-Desktop, Signal-iOS, Signal-Android and the server's captcha page — a later milestone. `build.protocols` now registers `swarm` alongside `sgnl` and `signalcaptcha` so the SWARM scheme is claimed. |
| Other locales (`_locales/<lang>/messages.json`) | 67 locales still say "Signal" in already-translated strings. New SWARM keys fall back to English correctly (`app/locale.node.ts` merges English first, then the matched locale key by key), so nothing is missing — but a French user still reads "Signal" in translated sentences. Re-translation is an owner decision. |
| `ts/updater/**` beyond the two key getters | The updater never starts while `updatesEnabled` is false (`ts/updater/index.main.ts` `autoUpdateDisabled()`). |
| Donations pages, badge parsing | Left in the tree with the entry points removed, to keep upstream merges small. |
| Anything in `libsignal` | Project rule. Opus M-D forks it separately. |

## 8. Tests touched

- `ts/test-node/updater/curve_test.node.ts`: the case that verified a signature
  made with **Signal's** update signing key is `it.skip`ped with an explanation —
  the key is not in config any more and SWARM has no update feed. The sign/verify
  roundtrip case still runs.
- Sample URLs in stories and tests moved from `signal.org` to `swarm.green` so the
  scan test in §2c can be strict.
- New: `ts/test-node/swarm/endpointGuard_test.node.ts`,
  `ts/test-node/swarm/noSignalEndpoints_test.node.ts`.
