# QCF Contacts preview 0.1.4-beta.2

Talkdesk now uses a simple clipboard workflow. The browser calling page has been removed.

## Test the update

1. Quit the previous preview using its tray menu, then run the new portable preview. Closing the widget alone only hides it.
2. Your existing preview contacts should still be there. The preview uses the same QCF Contacts Preview profile across versions.
3. To bring over your regular app's configuration, first quit the regular app, then open **Settings → General → Copy setup from regular app**. Review the contact count and confirm **Restore and restart**. This replaces the preview's contacts/settings, makes a safety backup of its previous setup, and leaves the regular app unchanged.
4. Your Microsoft app ID/tenant and Salesforce consumer key should now be filled in. Sign in again to connect these accounts in the preview.
5. Select **Settings → Call & Text → Talkdesk**. Set Office/Cell stars independently for calling and texting on a test contact.
6. **Copy for call** copies the starred calling number. Paste into Talkdesk's dialer. **Copy for text** copies the starred texting number. Paste into its SMS recipient field. Neither action opens a browser, places a call, sends a message or marks the contact as reached.
7. Use **Settings → General → Save backup**. Save the JSON file somewhere you keep private work files.
8. Change a sample contact's note, then choose **Restore backup**, select the saved file, review the confirmation, and restart. Verify the note, order, phone stars, photos and integration IDs return to their saved values. Restore replaces the current setup; it does not merge contact lists. Sign in again afterward.
9. Quit and reopen once more. Confirm the restored setup persists.

## What is saved

- Contacts, Office/Cell numbers and defaults, notes, order, pins, activity history, Salesforce/Microsoft record references and available local contact photos/logos.
- Settings, including Microsoft app ID and tenant, Salesforce consumer key and login URL, dialer, appearance, keyboard shortcut and window preferences.
- Clients hidden/not-client choices and first-seen/viewed markers. Cached email content is not exported; the list refreshes after sign-in.

OAuth sessions, passwords, browser cookies and the private-repository updater token are not exported. Restoring archives existing Microsoft/Salesforce session files locally and requires sign-in again. Ordinary updates keep the existing profile and session files; account policies can still require reauthentication.

## Automatic protection

The app saves one checkpoint on the first launch of each day/version and keeps the latest ten automatic checkpoints. **Automatic backups** opens their folder. It also makes a separate safety backup before a restore. A failed safety backup prevents replacement. Missing cached images do not block recovery of the contact's details.

Stable builds use QCF Contacts; previews use QCF Contacts Preview; development builds use QCF Contacts Development. These paths do not contain a version number. Preview builds update manually, avoiding a switch to the stable profile through the automatic updater. Switching between preview and stable remains an explicit transfer using a backup file.

An invalid setting is recovered independently so other valid integration settings survive. Malformed or unreadable saved JSON is left in place and startup stops with an error instead of creating an empty setup over it.

## Validation

Automated coverage exercises Talkdesk clipboard-only routing, unchanged contact history, backup round trips, restored app IDs/consumer keys, images, Clients choices, restart persistence, rejection of invalid backups, and safety-backup failures. Native dialog/relaunch interaction and actual Talkdesk pasting still require the hands-on checks above.
