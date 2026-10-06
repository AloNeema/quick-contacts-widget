# Paste a signature — preview 0.1.4-beta.4

1. Quit the previous preview from its tray menu and open this preview. It uses the same preview profile, so existing contacts and configuration stay in place.
2. Open **Settings → Contacts → Paste signature**.
3. Copy just one person's email signature as text from Outlook and paste it into the box.
4. Choose **Review contact**. Check the suggested name, title, company and email. Check Office/Cell and set the call/text stars.
5. Expand **Original signature** to compare uncertain details or copy an additional phone number into the correct field. When multiple emails were found, the email field offers those addresses as suggestions.
6. Choose **Add contact**. The new contact appears in the widget. Existing Outlook and Salesforce records are not changed.

The app processes this text locally. It does not need an AI subscription, API key or new IT integration. Different layouts are handled by detecting common contact patterns; names, roles and companies remain suggestions and can need correction. Logos, image-only signatures, and contact details hidden behind link text are not extracted. This version supports US-format phone numbers.

Fax numbers are kept out of dialing fields. Extensions are saved in Notes and must be entered manually after dialing. A second unlabeled phone number is not silently classified as a cell. Extra numbers and multiple emails trigger a review message.

If the email already exists, you can open the existing contact for editing or deliberately add a separate contact. A shared phone number produces a warning but does not merge coworkers who use the same office line. Opening an existing contact discards the signature draft; it does not overwrite that contact's fields.

Parsing and canceling never add a contact. For a signature draft, photo actions require adding the contact first. You can attach a photo afterward through Edit. The original signature is shown during review but is not saved wholesale into Notes.

## Quick checks

- Paste a signature with labeled Office and Mobile numbers. Verify each lands in the correct field.
- Paste one with two unlabeled numbers. Confirm a warning appears and choose the correct Office/Cell values yourself.
- Paste a signature already in your contacts. Confirm the matching email warning appears.
- Cancel review and verify no new contact was added.
- Add a sample contact, then quit and reopen to check that it remains saved.

Backup/restore, clipboard-only Talkdesk actions, and the preview startup isolation fixes remain included. This is a manually launched preview; Settings shows its full version as 0.1.4-beta.4.
