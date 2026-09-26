# SWARM Messenger — configuration

Last updated 2026-09-26 (M1, Opus M-A).

This is the one place that says where SWARM Messenger points, what is still a
placeholder, and how to fill it in. If you change an endpoint, change it here too.

## The files

| File                                                   | When it is used                                                                 | What it holds                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `config/swarm-staging.json`                            | Source of truth. Not loaded directly.                                           | The canonical SWARM endpoint set.                                                              |
| `config/default.json`                                  | Always, as the base layer.                                                      | The same endpoints as `swarm-staging.json`, plus the non-endpoint defaults upstream kept here. |
| `config/production.json`                               | Every **packaged** build (a packaged app always reports `NODE_ENV=production`). | The same endpoints again.                                                                      |
| `config/staging.json`, `config/development.json`       | `NODE_ENV=staging` / `development`.                                             | Only `storageProfile` and `openDevTools`; endpoints come from `default.json`.                  |
| `config/local-development.json`, `config/local-*.json` | Local overrides. **Git-ignored.**                                               | Put a private root certificate or a loopback `serverUrl` here.                                 |

`node-config` picks a file by `NODE_ENV`, and `swarm-staging` is not a valid
`NODE_ENV` (`ts/environment.std.ts` allows `development`, `production`, `staging`,
`test`). That is why the endpoint values are repeated rather than imported.
`ts/test-node/swarm/endpointGuard_test.node.ts` fails if the three files drift
apart, so the duplication cannot rot silently.

Staging and production currently point at the **same** host, because SWARM has one
chat server. When a separate production server exists, change
`config/production.json` and relax the "must match" assertion in that test.

## The endpoints

| Key                        | Value                                                           | Used by                        |
| -------------------------- | --------------------------------------------------------------- | ------------------------------ |
| `serverUrl`                | `https://chat.swarm.green`                                      | chat API and websocket         |
| `storageUrl`               | `https://chat.swarm.green`                                      | storage service (see below)    |
| `cdn.0`, `cdn.2`, `cdn.3`  | `https://cdn.chat.swarm.green`                                  | attachments, stickers, backups |
| `sfuUrl`                   | `https://sfu.chat.swarm.green/`                                 | group calls                    |
| `challengeUrl`             | `https://chat.swarm.green/challenge/generate.html`              | rate-limit captcha             |
| `registrationChallengeUrl` | `https://chat.swarm.green/challenge/registration/generate.html` | registration captcha           |
| `contentProxyUrl`          | `https://contentproxy.chat.swarm.green`                         | link previews                  |
| `updatesUrl`               | `https://static.swarm.green/desktop`                            | see "updates" below            |
| `resourcesUrl`             | `https://static.swarm.green`                                    | optional resources             |

The hostnames are the owner's decision of 2026-09-26 and are final.
`reg.chat.swarm.green` is **reserved but not published**: the server's
`endpoints.registration` is `null` on purpose, and the desktop does not have a
separate registration endpoint anyway (registration goes through `serverUrl`).

### Why `storageUrl` is the chat host

The staging server runs no separate storage service, so there is no
`storage.chat.swarm.green` to point at, and the owner chose the chat host. What
the desktop does when the storage service does not answer: storage requests are
ordinary HTTPS to `storageUrl` + `/v1/storage/…`
(`ts/textsecure/WebAPI.preload.ts`, the `storageService` host case). A 404 on the
manifest is read as "no manifest yet" and a new one is created
(`ts/services/storage.preload.ts`); anything else is logged as an error and the
sync is retried. **Messaging keeps working** — what breaks is the sync of
contacts, groups and settings between a user's own devices, with a repeating
error in the log. Change this the moment a storage service exists.

All three CDN numbers are the same host on purpose: Signal's cdn0/cdn2/cdn3 are
storage generations, and one staging host serves them all because the paths
already differ (`/attachments/…`, `/stickers/…`). If the SWARM server ever needs
to tell them apart, give each a path prefix (`/cdn0`, `/cdn2`, `/cdn3`) — the
client only concatenates, so a prefix works (`ts/textsecure/WebAPI.preload.ts`,
`cdnUrlObject`).

## Placeholders you must replace

These four values are generated by the chat server and cannot be invented:

- `serverPublicParams`
- `genericServerPublicParams`
- `backupServerPublicParams`
- `serverTrustRoots` (an array)

They are currently the strings `SWARM-PLACEHOLDER-<name>`.

**To wire them in, one command:**

```
node scripts/swarm-import-params.mjs
```

It reads `D:\swarm-messenger\shared\staging-public-params.json` — the file the
server fork writes, in the format documented in that repo's `docs/STAGING.md`
section 5a — validates it, and writes the values into all three of
`config/swarm-staging.json`, `config/default.json` and `config/production.json`,
keeping them identical. Then run `pnpm run test-node`: the assertions in
`ts/test-node/swarm/endpointGuard_test.node.ts` are what tell you the job is done,
and the zkgroup test starts verifying `serverPublicParams` again the moment it
stops being a placeholder.

That file carries three fields the desktop does not use, and they are dropped on
purpose: `callingServerPublicParams` and `callingServerPublicParamsPreV101` (not
in Signal Desktop's renderer config) and `registrationCaCertificatePem` (the
stack's internal CA for the chat server's own gRPC hop to the registration stub;
public HTTPS uses Let's Encrypt, so a client never needs it).

`serverTrustRoots` is a **list**, and stays one: a rotation publishes the new root
beside the old one so clients accept both during the overlap. The placeholder
check walks the list and names the offending index.

**Until then the app refuses to start.** `app/swarmStartupGuard.main.ts` runs
before any window opens and shows a plain-language dialog naming each placeholder.
For local development on an unpackaged tree you can set
`SWARM_ALLOW_PLACEHOLDER_CONFIG=1` to continue past it with a loud warning in the
log; a **packaged** build ignores that variable, so no installer can bypass the
check.

### `certificateAuthority`

Deliberately **absent**, which means the system certificate store is used. Upstream
pinned Signal's own CA here. Set it only when you talk to a server with a private
root — put the PEM in `config/local-development.json`, which is git-ignored.

## The libsignal-net limitation (read this before M2)

`libsignal-client` 0.101.2 exposes exactly three network environments
(`node_modules/@signalapp/libsignal-client/dist/net.d.ts`, `NetConstructorOptions`):

- `Environment.Staging` — Signal's staging hostnames, compiled into the Rust crate
- `Environment.Production` — Signal's production hostnames, likewise
- `localTestServer: true` — a loopback host and port, plus a root certificate

There is **no way to point libsignal-net at a custom domain**. Upstream
`resolveLibsignalNet()` fell through to `Environment.Production` for anything it
did not recognise, which for `chat.swarm.green` would have meant the chat and
registration traffic going to **Signal's production servers**. That is now a hard
refusal (`ts/textsecure/preconnect.preload.ts`).

So until libsignal gains a SWARM environment, the only working route is the
loopback one: the SWARM chat server must be reachable at `https://localhost:<port>`
from the client — directly or through a tunnel — with its root certificate in
`certificateAuthority`. `ts/util/isMockServer.dom.ts` decides this from the
hostname, and the port is taken from the URL.

### Switching to `Environment.Swarm` when Opus M-D's fork lands

Opus M-D is forking libsignal into `Swarm-Official/swarm-libsignal` and adding a
SWARM environment. When the prebuilt package is published (consumption note at
`D:\swarm-messenger\shared\libsignal-swarm.md`), this is the whole change:

1. `ts/textsecure/preconnect.preload.ts` → `resolveLibsignalNet()`. Replace the
   `swarmTarget === 'unsupported-custom-host'` refusal with
   `return new Net.Net({ env: Net.Environment.Swarm, userAgent })`. Nothing else in
   that function moves.
2. `ts/util/swarm/endpointGuard.std.ts` → `describeLibsignalNetTarget()`. Return a
   new `'swarm'` case for a `*.swarm.green` host instead of
   `'unsupported-custom-host'`, and add it to `LibsignalNetTargetType`.
3. `package.json` → the `@signalapp/libsignal-client` dependency points at the
   SWARM build.

The endpoint-guard test has a case asserting the current
`'unsupported-custom-host'` answer, so step 2 cannot be forgotten.

## Updates

`updatesEnabled` is `false` everywhere, every `publish` target in `package.json` is
empty, and Signal's NSIS mirror and update-signing keys (`updatesPublicKey`,
`appImageUpdatesPublicKey`) are gone. SWARM Messenger never checks for updates.

`updatesUrl` and `resourcesUrl` are still present and point at
`static.swarm.green`, because they are **not** only update feeds: Signal reuses
that host as a static asset host, and `ts/services/profiles.preload.ts`
(`getProfile`) asserts `updatesUrl` is a string on **every profile fetch**
(badge image URLs are built from it). Removing the key would break profile
fetching, so it points at a SWARM name instead. `static.swarm.green` does not
have to exist for the app to work; only badge images would 404.

The same applies to the Electron spellchecker dictionary host
(`app/updateDefaultSession.main.ts`), now `static.swarm.green`: dictionaries will
not download until someone mirrors them there. Open item.

## Donations

`stripePublishableKey` is gone from every config file and is optional in the
schema. The Donations settings page has no entry point any more
(`ts/components/Preferences.dom.tsx`), and the two Stripe calls in
`ts/textsecure/WebAPI.preload.ts` throw a plain message if anything ever reaches
them.
