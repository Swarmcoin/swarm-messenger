# Wallet sign-in: no phone number, no SMS (desktop side)

**Status: implemented, wave 1.** Written 2026-09-27 by Opus M-F. The server half of the same protocol
is documented in `Swarm-Official/swarm-messenger-server`, `docs/WALLET-SIGN-IN.md`; read that one for
the server's reasoning, the `+888` choice and the threat notes. This one is about the app.

The owner's decision, 2026-09-27: _"instead of a phone number make the users sign in with our
wallet."_

---

## 1. What a person now sees

"Create account on this computer" no longer asks for a phone number, a captcha or a code. It asks one
question: **create a new wallet, or restore one from its recovery phrase?**

- **Create a new wallet** → 24 words appear, numbered, once. A checkbox confirms they have been
  written down. Continue, and the account exists.
- **I have a recovery phrase** → type the 24 words. The same words give the same account, on this
  machine or any other.

Then the existing profile screen (name, avatar), and that is the end of registration. **There is no
PIN step**: a SWARM account's recovery is its recovery phrase, and there is no SVR to put a PIN in.

Nothing ever shows the synthetic `+888…` identifier the account is keyed by. People are found by
username; finding by wallet address is wave 2.

---

## 2. What happens underneath

```
recovery phrase (24 BIP-39 words)
   │  PBKDF2-HMAC-SHA512(NFKD(phrase), "mnemonic", 2048)  → 64-byte BIP-39 seed
   ├── HKDF-SHA256(seed, "SWARM-Messenger-ACI-identity-v1") → clamp → ACI identity key pair
   ├── HKDF-SHA256(seed, "SWARM-Messenger-PNI-identity-v1") → clamp → PNI identity key pair
   └── the SWARM wallet's own spending keys (the wallet's code, not this app's)

POST /v1/swarm/registration/challenge  { identityKey }           → { challenge, ttlSeconds }
POST /v1/swarm/registration/verify     { identityKey, signature } → { number, registrationPassword }
POST /v1/registration                  (Signal's own endpoint, unchanged)
```

The signature is over `"SWARM-Messenger-wallet-registration-v1" || identityKey || challenge`, made
with libsignal's own `PrivateKey.sign`. The account identifier is
`+888` then `10^10 + (high 8 bytes of SHA-256("SWARM-Messenger-e164-v1" || identityKey) mod 9·10^10)`,
which the server derives independently and refuses to disagree about.

**One recovery phrase for the money and the identity.** The phrase is a standard BIP-39 phrase, so the
same words open the SWARM wallet - that is what makes "restore" restore everything.

### No new cryptography

| Step            | Whose code                                                      |
| --------------- | --------------------------------------------------------------- |
| BIP-39 checksum | Node's `crypto.createHash('sha256')`                            |
| BIP-39 seed     | Node's `crypto.pbkdf2Sync(..., 'sha512')` - BIP-39 as specified |
| key stretching  | `hkdf` from `@signalapp/libsignal-client`                       |
| key types       | libsignal's `PrivateKey` / `IdentityKeyPair`                    |
| the signature   | libsignal's XEdDSA (`PrivateKey.sign`)                          |

libsignal itself is untouched, as are the protocol, the session establishment and the message
encryption. The wallet's Rust addon is untouched.

---

## 3. The code

New:

| File                                                                                      | What                                                                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ts/util/swarm/bip39.node.ts`                                                             | generate, check and normalize a 24-word phrase; the BIP-39 seed                                  |
| `ts/util/swarm/bip39Wordlist.node.ts`                                                     | the 2048-word English list, verbatim from the BIP-39 specification, its digest checked by a test |
| `ts/util/swarm/walletIdentity.node.ts`                                                    | the ACI/PNI derivation, the account identifier, the challenge message and signature              |
| `ts/components/standaloneRegistration/stages/WalletSignIn.dom.tsx`                        | the one new screen (choose / write down / restore)                                               |
| `ts/test-node/swarm/bip39_test.node.ts`, `ts/test-node/swarm/walletIdentity_test.node.ts` | the tests                                                                                        |

Changed:

| File                                                                                                                                  | Change                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ts/types/StandaloneRegistration.std.ts`                                                                                              | the `WALLET_SIGN_IN` stage, its statuses, its place in the stage graph; `PROFILE_ENTRY` may now complete registration                                                                                       |
| `ts/state/ducks/standaloneInstaller.preload.ts`                                                                                       | `startRegistration` starts at the wallet stage; four new actions (`createWalletForSignIn`, `enterRecoveryPhrase`, `backToWalletChoice`, `signInWithWallet`); the PIN stages are skipped for a SWARM account |
| `ts/textsecure/WebAPI.preload.ts`                                                                                                     | the two new endpoints; `createAccount` takes a session **or** a registration password and, without a session, calls libsignal's `RegistrationService.reregisterAccount`                                     |
| `ts/textsecure/AccountManager.preload.ts`                                                                                             | `registerAsPrimaryDevice` accepts the derived identity key pairs instead of generating random ones, and takes the new `verification`                                                                        |
| `ts/components/standaloneRegistration/StandaloneRegistration.dom.tsx`, `ts/state/smart/StandaloneRegistration.preload.tsx`, the story | render and wire the new screen                                                                                                                                                                              |
| `_locales/en/messages.json`                                                                                                           | 19 new strings, all `icu:StandaloneRegistration--WalletSignIn--…`                                                                                                                                           |

The phone number, captcha and verification-code stages are **left in place and unreached**. They are
the upstream flow; deleting them would make every future merge from upstream harder for no gain, and
an ordinary phone number still registers through them if a deployment wants that.

### The one place we reach into a dependency

libsignal's session-less registration is a static, `RegistrationService.reregisterAccount(options,
inputs)`, and `options` is the `{ tokioAsyncContext, connectionManager }` pair that `Net` builds for
its own registration calls but does not expose. `WebAPI.preload.ts` reads that pair off the `Net` we
already have rather than constructing a second `Net` (which would mean two connection managers, two
tokio runtimes, and two sets of proxy and censorship settings that could drift apart). It checks both
fields are present and throws a named error if they are not, so a libsignal upgrade that renames
either one fails loudly at sign-in instead of somewhere unrecognizable. If that ever happens, the
alternative is to post `/v1/registration` directly from `WebAPI`.

---

## 4. What the phrase is allowed to touch

- It is read from the screen, turned into keys, and dropped. It is **not** written to disk, **not**
  put in the log, and **not** sent anywhere.
- It sits in the registration workflow's redux state only while the "write these down" screen is
  showing it, because nothing else can put it in front of a person. Nothing in this app writes redux
  state to a log.
- The derived seed is zeroed after use; the private keys go where Signal's own identity keys go, into
  the protocol store.
- What crosses the network is an identity **public** key and a signature.

---

## 5. Tests

```
pnpm run test-node:swarm     # 52 tests, including the pre-existing endpoint guards
```

- `bip39_test.node.ts` — the vendored wordlist's SHA-256 matches BIP-39's published `english.txt`; all
  four of BIP-39's own 24-word test vectors; 32 generated phrases are valid and distinct; wrong word
  count, unknown word, bad checksum and empty phrase all refused with the right reason; capitals,
  padding and tabs forgiven; the seed is 64 bytes and independent of how the phrase was typed.
- `walletIdentity_test.node.ts` — three derivation vectors that the **server's own test carries
  byte-for-byte**; the same answer however the phrase was typed; ACI and PNI keys differ; distinct
  phrases give distinct accounts; the clamped private key round-trips through libsignal unchanged; the
  identifier's shape, and eight things that are not identifiers; the identifier recomputed by hand;
  the signed message byte-for-byte; a signature does not answer a different challenge, and a
  signature made with another key does not verify.
- `tsc --noEmit` is clean apart from one pre-existing, unrelated error (`fs-xattr`, a macOS-only
  optional dependency).

**Not yet proven live.** `chat.swarm.green:443` was closed while this was written - the TLS edge waits
on the owner's Let's Encrypt contact address - so no desktop has registered against the real server
with this code yet. What is proven: the derivation matches the server's, byte for byte, by the shared
vectors; the request and response shapes match the server's DTOs and its controller tests; the whole
client compiles and its unit tests pass.

### What remains to prove, in order, the moment 443 answers

1. Instance A (`D:\swarm-messenger\.tools\Start SWARM Messenger A.cmd`) → "Create a new wallet" →
   write the words down → account created, profile screen, inbox.
2. Instance B → "I have a recovery phrase" with a **different** new wallet → second account.
3. A message from A to B and back.
4. Then: restore A's phrase into a third profile directory and confirm it lands on the same account.

---

## 6. Wave 2

- Find by SWARM wallet address (server maps an address hash to an ACI, as it already does for username
  hashes) and a username suggested from the wallet.
- Mount `swarm-wallet-core` in the main process with the phrase from sign-in, so the Wallet pane opens
  the same wallet the account was derived from. Until then the phrase is the person's only copy - the
  screen says so.
- Confirm, against the wallet addon itself, that a phrase generated here is accepted by
  `init_from_seed` (it is a standard BIP-39 phrase, and the addon's own generator makes the same kind,
  but it has not been round-tripped through the addon on this machine yet).
