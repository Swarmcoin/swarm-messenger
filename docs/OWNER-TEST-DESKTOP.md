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
| Photos and files both ways, and profile photos (section 6a)        | "Restore a wallet" landing on the same account (built, not yet tested live)              |

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
   window B) and click **Continue**. The photo is optional: **Add photo** works, and section 6a
   says when the other person sees it.
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

### 6a. Files and profile photos

Tested on 2026-09-27 between 19:58 and 20:46 UTC with two fresh accounts. To send a file, click
**+** at the right of the message box, choose **File**, pick a small document that is not private
(a `.txt` or `.pdf`), type a line if you like and press **Enter**. The bubble shows the file's name
and size and gets its ticks like a text message, and the other window shows the same file bubble
within a few seconds. A profile photo is set with **Add photo** in step 4, or later under
**Settings → Profile → Edit photo**, then **Photo**, a picture, and **Save**. Everything is
encrypted by the app before it leaves the PC; `cdn.chat.swarm.green` stores only scrambled bytes.
One thing looks like a fault but is not: until someone accepts your message request, their app
downloads nothing from you, so B sees a blurred circle instead of A's photo and a download arrow
instead of A's picture. Both appear the moment B clicks **Accept**. Once, a received file kept its
spinning circle although it had arrived; quitting and reopening that window showed it.

---

## 7. Known limits

- **Photos, files and profile photos** go through `cdn.chat.swarm.green` (section 6a). Voice
  notes should work the same way but were not part of this test. If an attachment ever stays on
  its spinning circle, it holds up every later message in that chat, because the app sends a
  chat's messages strictly in order. Hover over it, click **⋯**, **Delete**, then **Delete for
  me**; the messages behind it go out within a few minutes.
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
