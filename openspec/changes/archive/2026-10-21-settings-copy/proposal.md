# Proposal

## Why

Settings has the right shape since `settings-redesign` (cards with a heading, a sentence and rows) but the sentences grew into paragraphs: 29 of the 42 cards and 14 rows carry a description longer than one line (up to 296 characters on the Sidebar card, 284 on Assistant, 212 on Users), the three options of "How you work" each explain themselves in two sentences, and on the demo instance Account opens with a six-line notice before the first card. The Help view already holds the long version of every one of these texts, so the page says everything twice and the user reads it on every visit. A setting should explain itself in one line, and the rest should be one link away.

## What Changes

- **A copy rule for Settings, enforced by a test.** Every card and row has a label of at most 4 words and at most one line of description: 90 characters in English, one sentence, no second idea. An option in a choice card (How you work, Mode, Theme, Density, Date format, Time format, First day of the week) has a label and at most 60 characters. A notice (the demo note, encryption notes, "ask the server owner" notes, offline notes) is one line. Everything longer moves to the guide section the card's **Learn more** link opens.
- **One copy table.** The English text of every settings card, row, option and notice moves from the panels into one table, `web/src/app/settingsCopy.ts`, keyed by the card's existing heading id, with the Help screen id each card's Learn more opens. The panels read it; a unit test over the table fails when a description exceeds the limit, and a second source check fails when a panel passes its own literal instead.
- **Learn more per card.** The description line of a card may end with an inline "Learn more" link that opens contextual help at the card's screen id (`settings/<card>`), beside the page, as "Learn the method" on the How you work card already does. It is not a header action: the card header keeps no button and the page header keeps the one Help action.
- **Notices shrink to one line.** The demo note becomes "Demo instance: {features} are disabled here. Learn more", with the sandbox lifetime and the self-hosting sentence in the demo guide. Every other notice on a settings page follows the same rule. No safety warning is dropped: each keeps a one-line pointer on the page and its full text in Help.
- **The inventory.** The spec lists every card today with its current description length and its new one-line English text; the five other languages follow through the catalogs.
- **Help receives the moved text.** `docs/settings-you.md`, `settings-app.md`, `settings-data.md` and `settings-server.md` gain the sentences that leave the cards without a feature page; cards with a feature page (two-factor, passkeys, encryption, push, quick add, capture, email, calendar apps, calendar feeds, webhooks, backups, outgoing email, single sign-on, the assistant) send them to the section their screen id already names. Screenshots are refreshed with `make docs-screenshots`.
- No layout change: the three-column settings layout, the card anatomy, the rows, the controls, the badges and every behaviour stay. Fewer lines per card is the whole visible effect.

Out of scope: regrouping or reordering sections and cards (done by `settings-redesign` and `settings-sections`); new settings; the sidebar; the row anatomy and the `SettingRow` primitive's layout; copy outside Settings (dialogs, toasts, the task panel); the Help view itself; translating the guide. The confirmation dialogs' consequences (sign out everywhere, reset encryption) keep their full text: a dialog is where the long form belongs.

Advances ROADMAP.md: the Design refresh ("Settings regrouped into smaller sections with state-first cards", `settings-redesign`, as its copy follow-up) and UX-AUDIT.md items G5 (one card anatomy), L5 (copy names the action first) and O3 (copy rules in the interface guide).

No new environment variable. No change to the op log format. Not **BREAKING**.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `settings-navigation`: "Panel cards and rows" gains the one-line rule and the inline Learn more link; "Demo instance sections" states the one-line demo note; new requirements "Settings copy" (the rule, the table, the lint and how it coexists with the translation checks) and "Settings copy inventory" (every card with its current length and its new text).
- `design-system`: "Settings section and row patterns" states that a section's description is one line that may end with a Learn more link opening contextual help, that option descriptions in choice cards are at most 60 characters, and that longer text belongs in Help.
- `documentation`: "Contextual help" adds the Learn more link on settings cards as a place that opens the matching guide section beside the screen; the docs check already fails on a screen id no page declares.

## Impact

- Web app only. New `web/src/app/settingsCopy.ts` (the table) and `settingsCopy.test.ts` (the lint). `web/src/ui/patterns/SettingsSection.tsx` gains a `learnMore` prop (a screen id) rendered inline after the description; `settingsAnatomy.test.tsx` keeps failing on help links in card headers. Every panel that renders a `SettingsSection` or `SettingRow` under `web/src/app/` reads its copy from the table: `AccountSettings`, `method/HowYouWorkSection`, `method/MethodModeChooser` (`MODE_DESCRIPTION`), `PasswordSection`, `TwoFactorPanel`, `SecurityPanel`, `SsoPanel`, `EncryptionPanel`, `ActivityPanel`, `AppearanceSection`, `PreferencesPanels`, `DateTimeSettings`, `CalendarSettings`, `NotificationsSettings`, `DigestCard`, `QuickAddSettings`, `VoiceSettings`, `CaptureSettings`, `EmailInboxPanel`, `AboutSection`, `CaldavPanel`, `CalendarFeedsPanel`, `WebhooksPanel`, `TokensSection`, `assistant/AssistantSettings`, `AssistantsPanel`, `DataSettings`, `ProjectsSettings`, `UsersPanel`, `MembersPanel`, `ProjectInvitePolicyPanel`, `BackupsPanel`, `AttachmentSettingsPanel`, `OutgoingEmailPanel`, `ServerArchivePanel`, `AuditPanel`, and the demo note in `SettingsView.tsx`.
- Catalogs: `web/src/locales/messages.json` (regenerated), `de.json`, `fr.json`, `es.json`, `it.json`, `pt.json` (the old entries leave, the new ones arrive, written by hand); `make i18n-check` stays the completeness check.
- Docs: the four `docs/settings-*.md` pages, the feature pages named above, `docs/interface-guide.md` ("Copy" and "Settings"), `docs/design-system.md` where it describes the settings section, new `screens` front-matter ids for cards without one, regenerated `web/src/generated/help.json`, and the settings screenshots under `docs/images/`.
- Specs: `openspec/specs/settings-navigation/spec.md`, `design-system/spec.md`, `documentation/spec.md`.
- Bundle: about 10.5 KB of English description text leaves the panels (9.4 KB static plus the composed ones) and about 6 KB comes back, so the main chunk shrinks by roughly 1.5 KB gzipped net of the table and the Learn more link (about 0.3 KB), and each of the five catalog chunks by roughly 1 KB gzipped. Binary and image size unchanged.
- No API, server, sync or data-model impact. No dependency.
