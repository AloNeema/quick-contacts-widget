# QCF Contacts desktop widget

A transparent, frameless Windows widget that floats on your desktop with your key work contacts and one-click **Call**, **Text** and **Email** actions. Contacts come from an Excel/CSV import or are typed in by hand; everything lives on your PC (no server, no accounts).

![icon](resources/icon.png)

## Talkdesk preview

Version 0.1.4-beta.3 simplifies **Talkdesk** to **Copy for call** and **Copy for text**. Paste the starred number into Workspace Desktop. No browser page is opened and copying does not update contact history. Settings → General now includes **Save backup**, **Restore backup**, automatic checkpoints and **Copy setup from regular app** in previews. Backups preserve Microsoft app ID/tenant, Salesforce consumer key, contacts, preferences, images and Clients hide/not-client choices. Sign-ins and the updater token are not exported. Preview builds use a separate **QCF Contacts Preview** profile, leave the regular app's OS startup setting unchanged and are updated manually. Use the portable preview for testing; the installer still shares the regular app's identity. See [setup and testing](docs/TALKDESK-PILOT.md).

## What it does

- Glass panel you drag anywhere; remembers position and size; hides to the tray instead of closing; optional *Keep on top* and *Start with Windows*.
- Hover a contact to reveal Call / Text / Email (and LinkedIn when a profile URL is saved). Search by name, company, email or number. Pinned contacts stay on top.
- **Call & Text providers**: RingCentral app (`rcapp://` links), Windows Phone Link (`tel:` / `sms:`), the Windows default app, or your own link templates.
- **Import**: pick an `.xlsx`, `.xls` or `.csv`; the column mapping is guessed from headers (Name, Title, Company, Email, Phone, LinkedIn, Photo URL) and can be corrected before importing. Re-imports match on email, then phone, and keep photos, pins and order. Rows missing both phone and email are skipped.
- **Photos and company logos**: drop an image on a contact, pick a file, or paste an image URL. Without a photo, the widget shows the company's website logo, taken from the work email domain (or a Website column/field) and cached per company; personal addresses like Gmail fall back to coloured initials. Toggle or refresh under Settings › Appearance. LinkedIn does not allow fetching other people's photos, so for a LinkedIn picture right-click it in the browser, *Copy image address*, and paste the URL (or save it and drop the file).
- **Appearance**: liquid-glass panel with Windows 11 acrylic blur (on by default), dark/light, accent colour, opacity, blur and density.
- **Microsoft 365**: sign in once with your own Azure app registration; sync pulls photos, titles and companies for anyone with a work email from the company directory and your Outlook contacts, and shows Teams presence dots. Never overwrites a photo you set yourself.
- **Summon hotkey**: `Ctrl+Shift+C` (configurable) pops the widget up with search focused. Type a name, `Enter` calls the top match, `Alt+Enter` texts, `Shift+Enter` emails, `Esc` hides.
- **Recent strip**: the six people you most recently called, texted or emailed, one click away above the list.
- **Groups and notes**: a Group column (Lenders, Brokers, Internal…) becomes filter chips; a Notes column or the edit form adds a one-line note shown on hover. Rows also show when you last contacted someone.
- **Click to copy**: hover a row and click the phone or email to copy it.
- **Auto-update**: checks GitHub Releases, downloads in the background and installs on quit.
- **Context drawer**: click a row to see the person's note, your most recent email with them and your next meeting together (from Outlook via the Microsoft 365 sign-in), with one-click open in Outlook or join in Teams.
- **Salesforce**: connect your own Connected App; sync links contacts by email to Salesforce Contacts or Leads and shows the top open opportunity's stage and amount under the name, with the full list and record links in the drawer.
- **Clients tab**: reads your Outlook Inbox and Sent Items (last 60 days by default, every 15 minutes) and lists people outside the company who look like clients, newest contact first. Anyone in Salesforce as a Contact or open Lead counts automatically; otherwise it takes two or more of: replied to your email, sent attachments, emailed more than once, or a back-and-forth. Coworkers, your lender list (Settings, plus any contact in a "Lenders" group), no-reply senders, newsletters and calendar replies never appear. Each row shows why, flags "Waiting on you" when they wrote last, and has Reply, Call, Keep (add to contacts) and an X to remove them (they return only if they email again; "Not a client" hides them for good). The tab badge counts clients added since you last opened it.
- **Sort**: the sort button beside search orders the list by your own order, A to Z, recently contacted, or most contacted (calls, texts and emails from the widget). Pinned contacts stay on top.
- **Dock mode**: collapse to a slim strip of avatars on the left or right screen edge; it expands when you hover and shrinks back when you leave.

## macOS (Apple Silicon and Intel)

The same app builds for macOS: the CI workflow produces a `.dmg` and `.zip` for `arm64` (M-series) and `x64`. It runs as a menu-bar app (no Dock icon), uses macOS vibrancy for the glass, `⌘⇧C` as the summon hotkey, and the *FaceTime & Messages* dialer preset (`tel:` / `sms:`); RingCentral's Mac app understands the same `rcapp://` links.

Builds are unsigned unless you add an Apple Developer certificate (`CSC_LINK` / `CSC_KEY_PASSWORD`, plus `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` for notarization) to the workflow secrets. An unsigned app opens with **right-click › Open** the first time, and macOS auto-update requires a signed build, so until then Mac users update by downloading the new dmg.

To build locally on a Mac: `npm install`, `npm run dev`, or `npx electron-vite build && npx electron-builder --mac`.

## Run it on your Windows PC

Prerequisites: [Node.js 22](https://nodejs.org) (the installer includes npm). No Rust, no Visual Studio.

```powershell
npm install
npm run dev          # launches the widget with hot reload
```

Build an installer and a portable exe (both land in `release\`):

```powershell
npm run dist:win
```

`QCF Contacts-<version>-x64.exe` is the installer; `QCF Contacts-<version>-portable.exe` runs without installing. The GitHub Actions `CI` workflow builds the same artifacts on `windows-latest` and `macos-latest` for every push.

The widget's data (`state.json` and the `photos/` folder) is in `%APPDATA%\QCF Contacts\`. Delete that folder to reset the app.

## Setting up Call and Text

| Provider | What to install / configure |
| --- | --- |
| RingCentral app | Install and sign in to the RingCentral desktop app. The widget opens `rcapp://r/call?number=…` and `rcapp://r/sms?type=new&number=…` ([RingCentral URI schemes](https://developers.ringcentral.com/guide/basics/uri-schemes)). |
| Phone Link | Pair your phone in **Phone Link**, then in **Settings › Apps › Default apps › Phone Link** make it the default for the `TEL` and `SMS` link types. If no app handles `sms:`, the widget copies the number to the clipboard and tells you. |
| Windows default | Whatever app owns `tel:` / `sms:` today (Teams, Zoom Phone, Skype…). |
| Custom | Any templates using `{e164}` (+15551234567), `{digits}` (15551234567) or `{national}` (5551234567). Only the scheme you type is allowed to open. |

Email always uses `mailto:` and opens your default mail app (Outlook).

## Microsoft 365 setup (one time)

1. In the Azure portal open **Microsoft Entra ID › App registrations › New registration**. Name it "QCF Contacts", pick *Accounts in this organizational directory only*, and register.
2. **Authentication › Add a platform › Mobile and desktop applications**, tick `http://localhost`, and set *Allow public client flows* to **Yes**.
3. Copy the **Application (client) ID** into Settings › Microsoft 365, save, then **Sign in with Microsoft**. The delegated permissions (User.Read, User.ReadBasic.All, Contacts.Read, People.Read, Presence.Read.All, Mail.Read, Calendars.Read) are consented at sign-in; none need an admin.
4. Click **Sync now**. Re-run it whenever people change roles; presence refreshes on its own every 45 seconds while the widget is signed in.

Tokens are cached in `%APPDATA%\QCF Contacts\m365-token-cache.bin`, encrypted with Windows DPAPI.

## Salesforce setup (one time)

1. **Setup › App Manager › New Connected App**, enable OAuth settings, callback URL exactly `http://localhost:48217/callback`.
2. Scopes: *Manage user data via APIs (api)*, *Perform requests at any time (refresh_token, offline_access)*, *Access unique identifiers (openid)*. Tick **Require Proof Key for Code Exchange (PKCE)** and untick **Require Secret for Web Server Flow**.
3. Paste the **Consumer Key** into Settings › Salesforce, set the login URL to your My Domain (or `https://login.salesforce.com`), save, then **Connect Salesforce** and **Sync now**.

The widget only reads Contacts, Leads, Accounts and Opportunities with your own user's permissions. Tokens are stored encrypted in `%APPDATA%\QCF Contacts\salesforce-tokens.bin`.

## Releasing an update

First complete the [native acceptance gates](docs/TALKDESK-PILOT.md#native-acceptance-gates-before-a-stable-release) for the final candidate. Update `version` in both `package.json` and `package-lock.json`, obtain fresh green CI, then merge and run the **Release** workflow from the Actions tab when release creation is approved. It builds on Windows and uploads the installer, portable exe and `latest.yml` to a **draft** release tagged `v<version>`; publish the draft and installed widgets pick it up within six hours (or via *Check now*). While the repository is private, each PC needs a fine-grained personal access token with read-only *Contents* permission pasted once under Settings › General › Private repository token; it is stored encrypted on that PC.

## Spreadsheet format

Any sheet with a header row works. Recognised header words (case-insensitive): *name / full name / contact*, *first*, *last*, *title / position / role*, *company / business / account / lender*, *email*, *phone / mobile / cell / direct*, *group / tag / category*, *notes / comments*, *linkedin*, *photo / headshot / avatar*. Phone numbers are stored as US E.164 (`+1XXXXXXXXXX`). A row needs a name plus an email or phone.

## Development

```
npm run typecheck   # main + renderer
npm test            # vitest: import mapping, merge rules, groups, recents, dial URI building
npm run lint
npm run build       # electron-vite bundles into out/
```

Layout: `src/main` (Electron main: windows, tray, JSON store, photos, spreadsheet reading, Microsoft 365 sync and Outlook context, Salesforce, hotkey, dock layout, updater, IPC), `src/preload` (typed `window.contacts` bridge), `src/renderer` (React UI: `widget/` and `settings/`), `src/shared` (data model and pure logic used by both sides, with tests). The selected icon is Blue Reach; artwork masters and alternatives are in `resources/icon-options`. Windows ICO files include sizes from 16 through 256 pixels. Runtime tray/window images are shipped with `extraResources`. The old `scripts/make-icons.mjs` is a legacy fallback generator; running it replaces the selected artwork.

Security posture: context isolation on, node integration off, a CSP in `index.html`, every IPC payload validated with zod in the main process, and `shell.openExternal` limited to `tel:`, `sms:`, `mailto:`, `rcapp:`, `msteams:`, `callto:`, `sip:`, `https://linkedin.com` and the scheme of a custom template.

This is a standalone desktop app. It does not depend on the QCF Offer Tool web app; it talks to Microsoft 365, Salesforce and your dialer directly.
