# Talkdesk pilot: 0.1.4-beta.1

This is a preview for verifying the Chrome extension handoff. Live calling has not been verified. The automated Chrome check returned `ERR_BLOCKED_BY_CLIENT` for the local page; its cause has not been established. No browser protections or company settings were changed. An IT-approved HTTPS host is an alternative deployment route still awaiting a host address and implementation.

## Try the preview

1. Run the portable preview. It uses a separate `QCF Contacts Preview` data folder, so import a sample contact or your spreadsheet. The stable app's contacts/settings are not migrated or modified.
2. Open **Settings → Call & Text → Talkdesk pilot**.
3. Keep Talkdesk Workspace Desktop running and signed in. Use the Chrome profile with the company extension. In the extension options choose **Callbar (Electron) / Workspace**.
4. Clicking Call opens a temporary local page in Google Chrome with the chosen Office/Cell number. Use the Talkdesk extension on that page, or select/right-click the number to find its Call option. If Chrome blocks the page, stop and ask IT about approved hosting or the relevant managed-browser setting; do not bypass the block.
5. **Copy for text** copies the contact's starred texting number. Paste into Talkdesk's SMS recipient field and compose there. This does not open a composer, send a message or verify SMS access.

Talkdesk documents [extension calling from Chrome into Workspace Desktop](https://support.talkdesk.com/hc/en-us/articles/204965789-Installing-Talkdesk-Click-to-Call-Extension). The local-page deployment is a pilot that still requires verification with the team's browser policy and extension. Plain numbers are shown without an OS `tel:` fallback, so an absent extension cannot silently send the call to a different app.

## Scope and behavior

- Office/Cell stars determine the number from quick actions, contact details, search shortcuts, recent contacts, dock and client calls.
- Talkdesk requests do not stamp last-contacted or increment the contact count. Opening a page and copying a number do not establish that a conversation happened.
- No Talkdesk credentials or company integration settings are required by this Chrome pilot. Existing Salesforce CTI is not changed.
- Only the selected number is kept in the app's handoff memory. The local URL uses a random ticket, is bound to 127.0.0.1, and expires after ten minutes. Responses prohibit caching and framing; invalid hosts, foreign origins and non-GET requests are rejected. At most twenty tickets are retained.
- The helper does not know whether Talkdesk is signed in, whether a call is active or whether a call succeeded. Finish active calls first: external click-to-call can enter Talkdesk's consultation/transfer flow.
- SMS composing and sending remain in Talkdesk. IT still needs to verify conversational SMS numbers and agent permissions.

## Validation

79 automated tests passed, including nine new tests for routing, no false contact-history updates, no alternative-dialer fallback, invalid input, local ticket access, expiry and limits. Type checking, lint and production build are checked separately when packaging. Live Talkdesk calling/texting and Chrome extension detection remain unverified because the local preview was blocked.

## Promotion criteria

Before merging or publishing as a stable update, verify the page loads in the managed company Chrome profile, the extension recognizes the number, the correct number reaches Workspace Desktop with an approved caller ID, and existing Salesforce behavior is preserved. Use an IT-approved test number and test idle/minimized/signed-out/active-call cases. Confirm Copy for text leaves history unchanged and routes neither calls nor messages through a personal phone application.
