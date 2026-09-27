# The Wallet pane (M3, wave 1)

**Status: implemented and proven in the running app on SWARM mainnet, 2026-09-27 (Opus M3).
Not yet reviewed.** In-chat payments are wave 2 and do not exist yet (section 10).

The pane opens from **Wallet** in the left navigation. It is the SWARM wallet, running in this
app's main process, opened from the same 24 words the account was created with.

---

## 1. What a person sees

| Part         | What it shows                                                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Header       | "SWARM mainnet", the light server as host:port, and the chain height the light server reports, with "Up to date" / "Catching up: block X of Y" and "Chain checked" when the server stated the genesis this network is held to.                                                                               |
| Balance      | **Confirmed** (spendable now) and **Pending** (received, not yet spendable), in SWM with all eight decimals, from zatoshi as `bigint` (`ts/util/swarm/swmAmount.std.ts`). Never a float.                                                                                                                     |
| Receive      | The `swm1…` address in JetBrains Mono, a **Copy address** button and a QR code, with one sentence saying an address is not secret but links the payments made to it.                                                                                                                                         |
| Send         | To, amount in SWM, optional memo. **Review payment** asks the wallet for a quote and sends nothing. The confirmation screen names the address, amount, fee and total, warns that a payment cannot be undone, and only its **Send X SWM** button sends. The result shows the txid and a link to the explorer. |
| Transactions | Newest first: received / sent / unknown (an unknown kind is never shown as income), amount, block or "Not yet in a block", memo, and the txid linked to the explorer.                                                                                                                                        |

Explorer links: `https://mainnet.explore.swarm.green/transactions/<txid>` on mainnet,
`https://explore.swarm.green/transactions/<txid>` on testnet. Both checked by hand on 2026-09-27:
`/transactions/<txid>` answers 200 on both explorers and `/tx/<txid>` answers 404 on both.

States, each in plain words (`ts/components/SwarmWalletPane.dom.tsx`):

| State       | When                                                  | The pane says                                                                                                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| loading     | before the first answer                               | Opening your wallet…                                                                                                                           |
| opening     | the wallet is being opened or created                 | The first time can take a minute while it catches up.                                                                                          |
| no-wallet   | no wallet file for this account on this computer      | Type the 24 words you wrote down; words for another account are refused.                                                                       |
| offline     | the light server does not answer                      | Can't reach the SWARM network; your wallet is safe on this computer and chats keep working; tries again every 30 s. Last known balance if any. |
| unavailable | the build has no wallet addon                         | This build has no wallet component. Chats work as usual.                                                                                       |
| error       | wrong chain, an unreadable wallet file, anything else | One sentence per case, and **Try again**.                                                                                                      |
| ready       | open and answering                                    | Everything in the table above.                                                                                                                 |

**Developer settings** (never in a packaged release):

- The pane shows a Mainnet / Testnet switch when `app.isPackaged` is false. The choice is kept in
  `ephemeral.json` (`swarm-wallet-network`); `config` key `swarmWalletNetwork` sets the default.
  Switching reopens the same seed on the other network inside the worker.
- `config` key `swarmWalletServer` points the wallet at another light server, `https://host:port`
  only (anything else is ignored). This is how the offline state was proven:
  `NODE_CONFIG={"swarmWalletServer":"https://lwd-main.swarm.green:9"}`.

## 2. One recovery phrase for the account and the wallet

- **At sign-in** (`signInWithWallet` in `ts/state/ducks/standaloneInstaller.preload.ts`), right after the
  identity is derived and before the chat server is asked for anything, the phrase is handed to the
  wallet service once. The wallet does not need the chat server, so it does not wait for it. The
  service creates the wallet with `SwarmWallet.restoreFromSeed`: for a phrase generated moments ago
  the birthday is the light server's tip minus 100 blocks (nothing can have been paid to it earlier),
  for a restored phrase it is the network's activation height.
- **Which wallet is whose.** The wallet file is named from the account's ACI identity public key,
  which the phrase derives (`walletIdentity.node.ts`):
  `<userData>/swarm-wallet/<chain>/wallet-<first 32 hex of SHA-256("SWARM-Messenger-wallet-file-v1" ‖ key)>.dat.enc`.
  All accounts share one base directory and have a file each, because the addon's base directory is
  a OnceCell that can be set once per process and never changed.
- **After a restart** the pane sends the signed-in account's identity public key (public) and the
  service opens that file. If there is none - another computer, a deleted file - the pane asks for
  the 24 words, and the service refuses words that derive a different account (`wrong-phrase`).
- The same words restore the chat account (M-F) and the wallet, on any computer.

## 3. Architecture

```
renderer (main window, React)
  ts/state/smart/SwarmWalletTab.preload.tsx   polls every 3 s while shown
  ts/services/swarmWallet.preload.ts          ipcRenderer.invoke, answers parsed with zod
        │  'swarm-wallet:*'  (ts/types/SwarmWallet.std.ts)
        ▼
main process
  app/SwarmWalletService.main.ts              sender check, validation, quote, key, state
  ts/util/swarm/walletIpc.node.ts             the validators (pure, tested)
        │  postMessage  (ts/workers/swarmWalletProtocol.std.ts)
        ▼
worker thread of the main process
  ts/workers/swarmWalletWorker.node.ts        one request at a time
  ts/workers/swarmWalletHandler.node.ts       swarm-wallet-core 0.2.0 + the Rust addon
        │  gRPC over TLS
        ▼
  lwd-main.swarm.green:8443  (mainnet)   ·   lwd.swarm.green:443  (testnet)
```

**Why a worker thread, and not the main thread.** Several addon entry points are synchronous and
block the thread that calls them. The proof showed it: with the light server pointed at an
unreachable port, `init_from_b64` - opening an existing wallet file - dialled the server and blocked
for about 20 seconds before failing. On the main thread that is 20 seconds in which no window gets
an IPC answer, i.e. a frozen chat. In the worker, the main process answered an unrelated IPC call in
1 ms throughout. The worker is part of the main process: not a renderer, not web content. It is never
terminated and restarted: the addon's globals live for the process, and a second load would find
its base directory already set.

## 4. The IPC surface

All `ipcMain.handle` / `ipcRenderer.invoke`. Every handler first checks that the caller is the main
window's top frame (`event.sender` and `event.senderFrame`); every other window (About, debug log,
PDF, permissions, screen share) is refused. Every payload is parsed; nothing from the renderer is used
as a path, a server, a chain or a key.

| Channel                         | In                                     | Out                                                | Checked in the main process                                                                                                                                                                                                                                          |
| ------------------------------- | -------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `swarm-wallet:get-state`        | `{ accountKey? }` (base64, 33 bytes)   | the state (section 1)                              | key shape (`^B[A-Za-z0-9+/]{43}$`); opens that account's file if it is not the open one                                                                                                                                                                              |
| `swarm-wallet:open-with-phrase` | `{ phrase, isNewPhrase, accountKey? }` | `{ ok, state }` or `{ ok: false, problem }`        | BIP-39 checksum; with `accountKey`, the phrase must derive exactly that account                                                                                                                                                                                      |
| `swarm-wallet:refresh`          | -                                      | the state                                          | retries an open that failed, else refreshes and syncs                                                                                                                                                                                                                |
| `swarm-wallet:quote-send`       | `{ to, amount, memo? }`                | `{ ok, quote }` or `{ ok: false, refusal }`        | address against this network (bech32m checksum, HRP, testnet spellings refused on mainnet and the reverse, Zcash refused); amount parsed exactly as SWM text; memo ≤ 512 bytes and never to a transparent address; amount ≤ spendable, then amount + fee ≤ spendable |
| `swarm-wallet:confirm-send`     | `{ quoteId }` (32 hex)                 | `{ ok, txids, saved }` or `{ ok: false, refusal }` | the quote this process issued, unexpired (110 s), once                                                                                                                                                                                                               |
| `swarm-wallet:cancel-send`      | -                                      | `true`                                             | drops the quote                                                                                                                                                                                                                                                      |
| `swarm-wallet:set-network`      | `{ network: 'mainnet' \| 'testnet' }`  | the state                                          | refused in a packaged build                                                                                                                                                                                                                                          |

Amounts cross as decimal zatoshi strings: a `bigint` cannot be put in the redux store and a `number`
cannot hold every balance exactly. Refusals are categories (`invalid-address`, `invalid-amount`,
`invalid-memo`, `insufficient-funds`, `not-ready`, `offline`, `quote-expired`, `rejected`); the
renderer turns them into sentences, except an address refusal, which carries the wallet's own
sentence naming the network the address belongs to.

## 5. Keys, seed and the wallet file

- The seed and the spending keys exist in two places only: inside the wallet file, and in the
  addon's memory in the worker thread. Neither is ever sent to a window.
- The wallet file is sealed at rest by swarm-wallet-core's `WalletStore` (AES-256-GCM, fresh nonce
  per save). Its 32-byte key is generated once and kept wrapped by the OS keychain through Electron's
  `safeStorage` - `config.json` key `swarmWalletEncryptedKey` - the same arrangement as the message
  database key. When the keychain is unavailable (or is Linux's `basic_text`) the file is left in the
  clear and the pane says so; a key written beside the file it protects would only look like
  encryption.
- While the wallet is open its plaintext exists on disk beside the sealed file; a graceful quit seals
  it and wipes the plaintext. Proven: after quitting, only `wallet-<id>.dat.enc` (header
  `SWMWALLET1`) was left.
- There is no channel that returns the phrase. Showing it again is wave 2 and needs OS
  re-authentication first.

## 6. Threat notes

| Concern                             | Wave 1                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keys in the renderer                | Never. The phrase crosses the renderer only where the person types or reads it (sign-in, restore form), as in wallet sign-in, and goes to the main process once. The restore field is cleared as it is sent.                                                                                                          |
| Addresses in logs                   | None. The service logs outcomes by category only; any error text passes `redactForLog`, which removes anything shaped like an address; the pane and its container log nothing about addresses or amounts. Checked in the proof: `swm1` / `swarm1` in the app's logs = 0.                                              |
| Amounts and txids in logs           | Not logged either: "transmitted 1 transaction(s)", not which.                                                                                                                                                                                                                                                         |
| A compromised renderer              | It is the interface, so it can ask for a quote and confirm it. What it cannot do: choose a path, a server or a chain, read the seed, confirm a quote it was not given, confirm after 110 s, or confirm twice. A confirmation drawn by the main process itself (a native dialog, or Windows Hello) is a wave-2 option. |
| Other windows                       | Refused by the sender check.                                                                                                                                                                                                                                                                                          |
| A light server that does not answer | Cannot block chat: the wallet is in a worker, every call has a timeout, the pane reads a cached state. Proven with an unreachable port.                                                                                                                                                                               |
| A light server on another chain     | swarm-wallet-core refuses a server whose chain label or genesis is not the network's before anything syncs; the pane says "different chain".                                                                                                                                                                          |
| The address on screen               | Linkable, and the pane says so. A fresh address per conversation is wave 2.                                                                                                                                                                                                                                           |
| Explorer links                      | Opened in the system browser, which tells the explorer which txid was looked at. Expected; the link is only followed on a click.                                                                                                                                                                                      |
| Chat backups                        | The wallet lives under `<userData>/swarm-wallet/`, outside the message database. That no backup path picks it up is to be pinned by a test in wave 2.                                                                                                                                                                 |
| swm1 decoding                       | The addon cannot decode SWARM mainnet addresses (it knows Zcash's three chains only), so an `swm1…` address is checked by swarm-wallet-core's own HRP and bech32m checksum. The fix belongs in the SDK.                                                                                                               |

## 7. Packaging

| Piece                                  | What                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vendor/swarm-wallet-core-0.2.0.tgz`   | The TypeScript wrapper: `npm pack` of `Swarm-Official/swarm-wallet-core` tag `swarm-wallet-core-0.2.0` (`d934f82`), built with its own `tsc`, with one change - `exports["."]` gains `"default"`, so CommonJS (the test runner) can load it. sha256 `c465d7306cf8450a48482c3f0abfc4578961552ad35353bbb020a4dda0e308d6`. A devDependency: rolldown bundles it. |
| `vendor/swarm-wallet-core-native.json` | The Rust addon is about 80 MB per platform and not in git. This pins the release URL and SHA-256 of each binary (darwin-arm64, linux-x64, win32-x64), as published by that release's CI.                                                                                                                                                                      |
| `scripts/swarm-fetch-wallet-addon.mjs` | Downloads this machine's binary into `vendor/swarm-wallet-native/` (git-ignored) and keeps it only if size and SHA-256 match. `pnpm run swarm:fetch-wallet-addon`. CI runs it before building the installer.                                                                                                                                                  |
| `package.json` `build.files`           | Adds `vendor/swarm-wallet-native/native-${platform}-${arch}.node`; `build.asarUnpack` already unpacks every `.node`, and the service loads it from `app.asar.unpacked`.                                                                                                                                                                                       |
| `rolldown.config.ts`                   | New worker bundle `bundles/workers/swarmWallet.js`.                                                                                                                                                                                                                                                                                                           |

A build without the addon starts and chats normally; the pane says the wallet component is missing.

## 8. Tests

`pnpm run test-node:swarm`:

- `swmAmount_test.std.ts` - eight decimals always, thin-space grouping, exact where a float is not
  (0.1 + 0.2, values above 2^53), strict parsing (no ninth decimal, no exponent, no separators).
- `walletIpc_test.node.ts` - every validator: mainnet address accepted; testnet `swarm1`, old `utest1`,
  testnet transparent and Zcash addresses refused with the sentence naming the network; damaged
  checksum refused; amounts; memo bytes and transparent destinations; insufficient funds; request
  shapes; the phrase derives the same account key as sign-in (the vectors the chat server's tests
  carry); wrong-account phrases refused; wallet file names; explorer URLs; server override; failure
  classification; no address survives `redactForLog`.
- `swarmWalletHandler_test.node.ts` - the worker's handler with a fake addon: never creates a wallet
  of its own; restores, seals at rest, reopens; snapshots as strings, newest first, malformed txids
  dropped; quotes confirmed once, only by their own id, never after expiry; the addon's own refusal
  passed through; the same seed reopened on testnet.
- `SwarmWalletPane_test.preload.tsx` - the pane rendered with the real English strings in its
  loading, offline (with and without a last balance), ready, catching-up, no-wallet, unavailable and
  testnet states, the explorer link scheme, and every refusal sentence.

## 9. Proof in the running app (2026-09-27, mainnet)

Desktop build of branch `codex/m3-wallet-pane`, a disposable profile, driven over Electron's DevTools
protocol:

1. First run → **Create account on this computer** → **Create a wallet** → 24 words (never captured)
   → written-down box → **Continue**. Log: `openWithPhrase: new phrase accepted`, `created the wallet file
key in the OS keychain`, `open: wallet open on mainnet` 1.5 s later. The staging chat server answered
   too (port 443 was open by then), so the account was created and the app reached the inbox.
2. **Wallet** in the left navigation → ready: "Block 1,598 · Up to date · Chain checked" while
   `https://lwd-main.swarm.green/status.json` said `node.height` 1598 (20:43:46 UTC); 0.00000000 SWM
   confirmed and pending; the `swm1…` address and its QR. `messenger-wallet-ready.png`.
3. Send 0.001 SWM with a memo → refused before any quote: "Not enough SWM. This payment needs
   0.00100000 SWM and 0.00000000 SWM is available." `messenger-wallet-send-refused.png`.
   A testnet `swarm1…` address → "That is a SWARM Testnet address … coins sent across them are lost."
   `messenger-wallet-send-testnet-address-refused.png`.
4. Quit → only the sealed file left. Relaunched with `swarmWalletServer` =
   `https://lwd-main.swarm.green:9` → "opening" for about 20 s, then "Can't reach the SWARM network …
   chats keep working", steady across retries; main-process IPC round trip 1 ms throughout.
   `messenger-wallet-offline.png`.
5. The disposable profile was deleted afterwards.

Screenshots are in `D:\swarm-work\smoke\` on the build workstation, not in the repository.

## 10. Not in wave 1

- In-chat payments and address exchange (section 11).
- Showing the recovery phrase again (needs OS re-authentication first); a new address per
  conversation; closing the wallet when the pane is idle; a main-process confirmation (native dialog
  or Windows Hello) before a send; a test that pins the wallet out of every backup path; Linux keychain
  backend changes (today: the wallet says it cannot open the file, and the 24 words restore it).
- swm1 decoding inside the addon (SDK work).

## 11. Wave 2: payments inside a chat

Following `docs/MESSENGER-INTEGRATION.md` §6-7 in swarm-wallet-core. Nothing here is built yet.

1. **Protocol.** `DataMessage.payment` gains a `SwarmNotification` arm (next free number in the
   `oneof`): `txid` (32 bytes), `amountZat` (uint64), `memoHash` (SHA-256 of the on-chain memo),
   `chain` ("swarm-mainnet"), optional `senderAddress`, optional `note`. A sibling `SwarmAddress`
   message (`SHARE` / `REQUEST`, address, chain) exchanges addresses. Both travel only inside the
   end-to-end encrypted message; the server sees ciphertext, as for text. libsignal and the protocol
   are unchanged: this is a new protobuf field in the app's own message body.
2. **Sending from a chat.** "Pay" in the composer opens the same quote → confirmation → send flow,
   addressed to the address the conversation already holds (shown, with the message it came from).
   After the transmit the service returns the txid, and only then is the notice sent. A lost notice
   loses the notice, never the money.
3. **Receiving.** `processPayment` gains a branch that refuses a notice for another chain. The bubble
   says "X SWM sent to you - waiting for your wallet to see it" until the wallet's own sync finds that
   txid with that memo hash, and only then "received". A notice alone is never shown as money
   received, or the message channel becomes a way to claim a payment that never happened.
4. **Addresses.** "Request address" / "Share address" messages; a request is an ask, never an automatic
   share. A fresh unified address per conversation by default. Stored against the conversation, not in
   a profile, so it never reaches storage service.
5. **Proof.** Two staging clients with wallets, addresses exchanged in chat, then one small real
   mainnet payment between the owner's two wallets with the txid on
   `mainnet.explore.swarm.green/transactions/<txid>` - the M3 exit criterion.
