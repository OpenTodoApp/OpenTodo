# Design

## D1. Where the seen version lives

Consent is server state, not an op (in-app-assistant "Per-user consent and own keys"), and the notice is about that consent, so the seen version sits next to it: a new column `assistant_consent.seen_version INTEGER NOT NULL DEFAULT 0`, added by a Go step like the routines-ai-step columns (an `ALTER TABLE ADD COLUMN` cannot be repeated). It is additive: older rows read 0, older servers ignore the column. Every device reads it from `GET /api/v1/me/assistant`, so Got it on one device hides the notice on all of them at their next status refresh. The row is the same for the on-device consent of an encrypted account (provider `device:<name>`), so that case needs nothing else. Withdrawing consent deletes the row; a new acceptance names the current version and never needs the notice.

Data model impact: one column on a server table; no op field, no sync or export change. No dependency, no image size or memory impact.

## D2. Who sees the notice

`CompleteDisclosureVersion` (4) is the first disclosure whose list is complete. The server returns `disclosure_notice: true` when the stored consent still counts (`Current`), names a version below 4, and `seen_version` is below 4. A consent given at version 4 or later never shows it. The app shows it only while the person is consented for the provider in use (in device mode: this device's provider), so a person who must accept again for another provider reads the full list in the disclosure instead.

## D3. What it offers

- **Review the list** expands the full list in place: the same `fields` (translated), the shared-projects sentence and, for the server's assistant, the routines paragraph. No navigation, so the notice stays where the person is.
- **Turn off the assistant** is the existing off switch: `PUT {consent: false}`, which deletes the consent; the assistant then asks before the next message and routines' AI steps stop, as after Withdraw consent in Settings.
- **Got it** sends `POST /api/v1/me/assistant/disclosure-seen` (sessions and full tokens, like `PUT /api/v1/me/assistant`; refused on a demo instance by the existing `/api/v1/me/assistant` prefix), which sets `seen_version` to the current `DisclosureVersion`. Both actions need a connection and are disabled offline with a line saying so. Nothing is queued; two devices pressing Got it converge on the same value.

## D4. Places

The chat panel body (the side sheet and the Assistant page share it), above the conversation, and the Routines page, above the tabs, when `routines_consented` is true. The Inbox card is not used: it is about runs, and the Routines page is where AI steps are written.

Interface budget: the notice is one row of chrome, shown until Got it or Turn off and then never again; it adds no scroll region (the panel's notice scrolls with the conversation), no shortcut, no task property and no sidebar destination.
