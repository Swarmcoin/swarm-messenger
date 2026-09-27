# Test SWARM Messenger on one PC: two desktops, one conversation

Written 2026-09-27 by Opus M-G, after doing exactly this on the owner's PC against the staging
server `chat.swarm.green`. Every step below was carried out and every screen below was seen on
that day, at `swarm-main` commit `a6af1d166` or later, unless a step says otherwise. Sending
photos was added to the server at 19:26 UTC the same day and was tested at 19:52 UTC.

You will run the desktop app twice on the same PC, as two separate people, **A** and **B**. Each
one creates its own wallet, becomes its own account, and then A and B message each other.

---

## 1. What works today, and what does not

| Works (tested 2026-09-27)                                          | Does not work yet                                                                        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Creating an account from a new wallet: no phone number, no SMS     | Finding someone by the account number shown in Settings ("Failed to fetch phone number") |
| Setting a username, and finding the other person by that username  | Stickers and GIF search (no sticker packs or GIF service on this server)                 |
| Text messages both ways, end-to-end encrypted, delivered in < 1 s  | Voice and video calls (no calling server yet)                                            |
| Message request, Accept, read and delivery ticks                   | Groups (no groups server yet) and call links (their credentials fail to verify)          |
| Closing both apps and opening them again: same accounts, same chat | Linking a second device, and the Linked devices screen                                   |
| Photos, both ways (sent, stored on `cdn.chat.swarm.green`, shown)  | "Restore a wallet" landing on the same account (built, not yet tested live)              |

This is the **staging** server. Everything on it is test data and may be wiped at any time. Treat
both wallets as throwaway: never send SWARM to them.

---

## 2. Before the first test: update and build (about one minute)

The app is already set up on this PC in `D:\swarm-messenger\Signal-Desktop`. Open **PowerShell**
(not as administrator) and paste these lines:

```powershell
. D:\swarm-messenger\.tools\swarm-env.ps1
$env:SWARM_ALLOW_MISSING_NATIVE = '1'
cd D:\swarm-messenger\Signal-Desktop
git pull --ff-only swarm swarm-main
pnpm install --frozen-lockfile
pnpm run generate
git log -1 --oneline
```

What you should see:

- `git pull` ends with a list of changed files, or `Already up to date.`
- `pnpm install` prints many red `gyp ERR! find VS` lines and a note
  `SWARM: electron-builder install-app-deps FAILED`, both about optional Windows Hello support
  that needs Visual Studio. **That is expected on this PC** and the install continues; it ends
  with `Done in …s`.
- `pnpm run generate` ends without the word `ERR` (it takes 10-30 seconds).
- The last line is the commit you are testing. Note it for your report.

The remote is called `swarm` in this folder (`origin` is the upstream project and is read-only).

---

## 3. Start the two instances

Double-click these two files, one after the other:

- `D:\swarm-messenger\.tools\Start SWARM Messenger A.cmd`
- `D:\swarm-messenger\.tools\Start SWARM Messenger B.cmd`

Each opens a black console window (leave it open, it is the app's engine), then the app window.
Because this is a development build, the app window also shows a **DevTools** panel down its right
side, which squeezes the app into a narrow strip. Close that panel with the **×** at its top right
(or drag the window wider). Do not close the console windows.

A keeps everything in `D:\swarm-messenger\.profiles\a`, B in `D:\swarm-messenger\.profiles\b`.
They never share anything, exactly as two different computers would.

**To start again from nothing:** quit both apps (**File → Quit SWARM Messenger**; the window's **×**
only hides the app next to the clock), delete the folders
`D:\swarm-messenger\.profiles\a` and `D:\swarm-messenger\.profiles\b` (they hold only test data),
and double-click the two files again.

---

## 4. Create an account on each (A first, then B)

Do this in window A, then the same in window B.

1. **First screen.** The SWARM mark, a QR code with "Scan this code in the SWARM Messenger app on
   your phone", and underneath **Create account on this computer**. Click that line. (The QR code
   is for linking to a phone and is not used in this test.) If you see "Something went wrong!
   Failed to connect to server" instead, the server is down: stop and report it.
2. **"Your SWARM wallet".** Two buttons: **Create a wallet** and **Restore a wallet**. Click
   **Create a wallet**.
3. **"Write these 24 words down".** 24 numbered words. For this test the wallet is throwaway, so
   you do not need to keep them, and **do not photograph or screenshot this screen**. Tick
   "I have written down my 24 words and stored them safely", then **Continue**. The words go away
   and the **Create a wallet** button spins for a few seconds while the account is created.
4. **"Set up your profile".** Type a first name (for example `Test A` in window A and `Test B` in
   window B) and click **Continue**. Skip the photo for this test: profile photos have not been
   tried in the app yet.
5. **The chat list.** "Chats", "No chats", and on the right "Welcome to SWARM Messenger".

If step 3 ends with "Could not reach the SWARM server", wait a minute and click **Create a wallet**
again (it will show new words; that is fine for a throwaway wallet).

---

## 5. Let A find B

People are found by **username**. The number under your name in Settings (for example
`123 456 78901`, really `+88812345678901`) is an internal account number, not a phone number:
typing it under New chat fails with "Failed to fetch phone number", because there is no number
directory on this server.

In window **B**:

1. Click the **gear** at the bottom of the left edge (Settings). The Profile panel opens on the
   right.
2. Click **Username**. Under "Choose your username", type a name of at least three letters, for
   example `beetest`. The app adds two digits of its own, for example `.42`.
3. Click **Save**. The panel now shows the full username, for example `beetest.42`, under your
   name. Write down the **whole** username, digits included.

In window **A**:

4. Click the **pencil** icon next to "Chats" (New chat).
5. In the box "Name, username, or number", type B's full username, for example `beetest.42`.
6. A line **Find by username** appears with the name under it. Click it. The conversation with
   B opens.

---

## 6. Send, accept, reply

1. **A:** type a message in the box at the bottom and press **Enter**. The bubble gets one tick,
   then two ticks once B's app has it.
2. **B:** the chat list shows **Test A** with "Message Request". Click it. At the bottom:
   "Let Test A message you and share your name and photo with them?" with **Block**,
   **Report…** and **Accept**. Click **Accept**, and **Accept** again in the "Accept request?" box.
3. **B:** type a reply and press **Enter**.
4. **A:** the reply appears within about a second, and the header of the chat now shows B's
   profile name (before B accepted it may show only the username).

Then the restart test:

5. Quit both apps: in each app window choose **File → Quit SWARM Messenger**. (The window's **×**
   only hides the app in the system tray next to the clock.) The console windows close by
   themselves.
6. Double-click both `.cmd` files again, open the chat on each side and send one more message each
   way. No new sign-in should be needed, and the old messages should still be there.
7. Optional, a photo: click **+** at the right of the message box, choose **Photos & videos**, pick
   a picture that is not private, and press **Enter**. The other window shows it within a few
   seconds.

---

## 7. Known limits

- **Photos and files** go through `cdn.chat.swarm.green`. Files other than photos, voice notes
  and profile photos should work the same way but were not part of this test. If an attachment
  ever stays on its spinning circle, it holds up every later message in that chat, because the
  app sends a chat's messages strictly in order. Hover over it, click **⋯**, **Delete**, then
  **Delete for me**; the messages behind it go out within a few minutes.
- No calls, no groups, no call links, no stickers, no second devices (see section 1).
- Settings and contacts do not sync to a server (there is no storage service yet). The app keeps
  working; it only logs `404` for it.
- The app window may say "Name not verified" next to the other person's name. That is normal for
  someone who is not in your contacts.
- This is Windows, from source, on the owner's PC. There is no installer for this test.

---

## 8. What to report back

For anything that does not match this page:

1. Which window (A or B), which step (for example "5.3"), and the time.
2. The exact words on the screen, or a screenshot, **but never a screenshot of the 24 words**.
3. The commit from section 2 (`git log -1 --oneline`).
4. The app's own log for that window, which never contains the 24 words:
   `D:\swarm-messenger\.profiles\a\logs\app.log` (A) or `D:\swarm-messenger\.profiles\b\logs\app.log`
   (B).

And, if everything worked: say so, with the commit, so the result can be recorded.

---

## 9. Usernames on the HTTP/2 build: set one, find the other account

Added 2026-09-27 by Opus M-H. These are the exact steps and screens from a run at 20:59-21:32 UTC
against `chat.swarm.green`, with the build from pull request `codex/mh-usernames` (libsignal
`0.101.2-swarm.2`, which talks to the server over HTTP/2) plus `codex/mh-zk-params`. Until those
are merged, `swarm-main` takes a username through a stop-gap (section 5 was tested on that); the
steps on screen are the same.

**Set a username (window A):**

1. Click the **gear** at the bottom of the left edge. The **Profile** panel opens on the right, with
   a row **@ Username** under your name.
2. Click **Username**. A panel titled **Username** opens with one text box (grey word
   `Username` inside it) and **Cancel** / **Save** at the bottom.
3. Type a name of at least three letters, for example `mhalice`. Within a second two digits appear
   at the right end of the box, for example `35`, and the full name above the box, for example
   `mhalice.35`. The digits are chosen by the app and cannot be picked.
4. Click **Save**. The panel closes; the Profile panel and the top of Settings now show
   `mhalice.35`, with a **QR code or link** row under it.
5. Tell the other person the **whole** username, digits included: `mhalice.35`, not `mhalice`.

**Find that account (window B):**

6. Click the **speech bubble** at the top of the left edge (Chats), then the **pencil** next to
   "Chats" (**New chat**).
7. In the box **Name, username, or number**, type the whole username: `mhalice.35`.
8. A heading **Find by username** appears with `mhalice.35` under it. Click that line. The
   conversation opens on the right with `mhalice.35` in the header.
9. Type a message at the bottom and press **Enter**. A sees it as a **Message Request** from B's
   profile name; after **Accept** (twice) A can reply, and B's header then shows A's profile name
   instead of the username.

**If it does not work:**

- **"Your username couldn't be saved. Check your connection and try again."**, or Save does
  nothing: check the app's log. In it
  (`D:\swarm-messenger\.profiles\<a or b>\logs\app.log`) the line
  `requires an H2 connection` means the libsignal in use is still `0.101.2-swarm.1`: pull, run
  `pnpm install --frozen-lockfile` and `pnpm run generate` again (section 2), then restart.
- **"This username is not available"**: type a different name. **"Too many attempts made,
  please try again later"**: wait a few minutes.
- **"… is not a SWARM Messenger user. Make sure you've entered the complete username."**: the
  username was typed without its digits, or with a typo. Ask for it again, digits included.
- **Typing the account number from Settings** (for example `188 745 44084`) still fails with
  "Failed to fetch phone number". That is expected: there is no number directory on SWARM, and
  usernames are the way to find people.

**What this build adds, and what it still does not:**

- The app now uses the server's HTTP/2 connection, which also carries the linked-devices list, the
  device name and the "Who can find me by phone number" switch (not tested by hand yet).
- Call-link credentials now verify: the app's log no longer repeats
  `Verification failure in zkgroup`, and it logs `saving 7 new call link auth credentials`.
- **Groups still do not work.** Clicking **New group** turns the window blank (the server does not
  yet send the group size limits the app reads; quit and restart the app to recover), and even with
  those the server has no groups service to store a group in. Do not try groups in this test.

---

## Appendix: the same test from a fresh clone

For anyone not on the owner's PC. Needs Windows, Git, Node `24.19.0` and pnpm 11. This was checked
on the owner's PC from a fresh worktree (`pnpm install` 31 s with a warm package store, generate
11 s); a clean machine downloads the dependencies first.

```powershell
git clone https://github.com/Swarm-Official/swarm-messenger.git
cd swarm-messenger
git checkout swarm-main
$env:SWARM_ALLOW_MISSING_NATIVE = '1'   # only on a PC without Visual Studio
pnpm install --frozen-lockfile
pnpm run generate
```

Then, in two separate PowerShell windows, one per person, each with its own profile folder:

```powershell
# window A
$env:SWARM_ALLOW_MISSING_NATIVE = '1'
$env:NODE_ENV = 'development'
$env:NODE_CONFIG = '{"storagePath":"C:\\swarm-test\\a"}'
pnpm exec electron .
```

```powershell
# window B
$env:SWARM_ALLOW_MISSING_NATIVE = '1'
$env:NODE_ENV = 'development'
$env:NODE_CONFIG = '{"storagePath":"C:\\swarm-test\\b"}'
pnpm exec electron .
```

`storagePath` is the whole trick: the app keeps its database, keys and logs there, so two folders
are two separate people. `NODE_ENV=development` is what lets `NODE_CONFIG` choose the folder; a
packaged build ignores it. Then follow sections 4 to 6.
