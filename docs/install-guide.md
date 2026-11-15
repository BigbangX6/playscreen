# Installing Playscreen (version 0.1)

*[Version française](guide-installation.md)*

Playscreen turns a Windows PC into a living-room console: your Steam, Epic Games,
Xbox / Game Pass and Battle.net games (and games without a launcher) in one interface,
**fully controller-driven**. Your PC stays a normal PC: Playscreen only opens when you ask
for it.

## Requirements

- Windows 10 (version 1809 or later) or Windows 11, 64-bit. A cloud PC (Shadow…) works
  too.
- A controller: Xbox, PlayStation, Switch or compatible (GameSir…).
- About 500 MB of space for Playscreen (not counting games), and Internet during setup
  (the chosen launchers are downloaded).

## Install

1. Download `Playscreen-Setup-0.1.0.exe` (the project's “Releases” page, under
   “Assets”).
2. Double-click it. **Windows may show “Windows protected your PC”**: this is because the
   installer isn't signed (a certificate is expensive). Click **“More info”**, then
   **“Run anyway”**.
3. Windows asks for administrator permission: **Yes**. This is the only time: everything
   that needs these rights is done now (Epic's games folder, firewall, launcher install
   tool), so you won't need a keyboard or mouse afterwards.
4. **Language**: your PC's language is already selected; Playscreen will use it too.
5. **“Where are your games?”**: check the launchers to install. Ones already installed
   aren't listed.
   - Steam and Epic Games install on their own.
   - Xbox and Game Pass: the Microsoft Store may open; click “Install”.
   - Battle.net: its installer opens; click “Continue”.
   - Options: the reminder when Windows starts (recommended) and the desktop icon.
6. Click **Install**: one to three minutes depending on the launchers.
7. **“Your console is ready”**: plug in your controller, leave “Open Playscreen now”
   checked and click **Finish**.

## First start

The **“Set up your console”** screen walks you through three steps:

1. **Install your launchers**: each card shows whether the launcher is installed; if not,
   “Install” downloads and installs it (no permission prompt).
2. **Sign in to your accounts**: “Sign in” opens the store's official page full screen.
   The controller becomes a mouse there: left stick to move, **A** to click, **Y** for the
   on-screen keyboard.
3. **Your games show up on their own**: the library fills up, with cover art.

“Later” skips this step; you'll find it again in **Settings › Accounts and launchers**.

## Using it

| On the controller | What it does |
|---|---|
| **Select + Y** | Opens Playscreen, or brings it back (even in a game: in-game menu) |
| **Select + X** | The controller becomes a mouse (launcher window, website…), or a controller again |
| A / B | Confirm / back |
| LB / RB | Switch tabs |
| Start | Quick menu (volume, Wi-Fi, sleep, Quit Playscreen…) |

On a PlayStation controller, Select = “Share” / “Create”; on a Switch controller,
Select = “−”.

**Controller mouse**: as soon as the controller becomes a mouse, a bubble in the
bottom-right corner reminds you of the buttons (move, click, right-click, scroll,
keyboard, Escape). A page that opens in the browser while Playscreen is open (for example
an Epic permission request) comes to the front, with the controller mouse.

When Windows starts, a small notification reminds you of **Select + Y**. As long as you
don't use it, Playscreen isn't running: only a tiny app (the “sentinel”, a few MB of
memory) listens to the controller.

**Quit Playscreen** (quick menu, Settings › Power, or the window's close button) closes it
completely; Select + Y opens it again.

**Language**: Settings › Playscreen › Language (French or English).

### Add a game without a launcher

Library → last tile **“+ Add a game”**:
- **Suggestions**: games and apps found on the Desktop and in the Start menu;
- **Browse folders** (RB): pick the game's folder then its `.exe`, with the controller.

Cover art is found automatically from the name (which you can change before adding).

### During a game

- Other launchers are closed automatically (the game's own launcher stays open), to leave
  the memory to the game; Playscreen also gives back its own memory.
- **Select + Y**: in-game menu (Resume, Quit game, Force close, volume…).
- For Steam games, Steam's in-game controller menu is turned on automatically.

## Uninstall

Windows Settings → Apps → **Playscreen** → Uninstall. You'll be asked whether to also
delete your data (store sign-ins, library): answer “No” if you plan to reinstall it.
Launchers and games stay installed.

## If something goes wrong

- **Select + Y does nothing**: the sentinel isn't running. Start menu → Playscreen.
- **A game stays behind Playscreen**: Select + Y, then “Resume”.
- **A launcher window needs a click**: Select + X (controller mouse), then Select + Y to
  come back.
- **A store says “Not signed in”**: Settings › Accounts and launchers › Sign in.
  Battle.net asks for its password again after the PC has been off for a long time.
- Useful logs: `%LOCALAPPDATA%\Playscreen` (`sentinel.log`, and in `Playnite`:
  `playnite.log`, `extensions.log`).
