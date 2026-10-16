# Tasks

## 1. Synced `language` field (design D1)

- [x] 1.1 Add `language` (`kString`) to the `user_prefs` entry of `internal/sync/ops.go` `Schema` with a comment citing this change and the allowed values. Extend the existing `user_prefs` sync test with a `language` op that lands in the author's personal scope only and converges by `(ts, device)`. Verify with `go test ./internal/sync/...`.
- [x] 1.2 Client data layer: `language: LanguagePref` on `UserPrefs` in `web/src/lib/types.ts`, `language: 'system'` in `USER_PREFS_DEFAULTS` (`web/src/lib/ops.ts`), `LANGUAGES`/`readUserPrefs`/`setUserPref('language', …)` in `web/src/lib/userPrefs.ts` with unknown values read as `system`. Verify with `userPrefs.test.ts` cases for a known code, an unknown code and an offline `mutate()` queued in the outbox (`npm test` in web/).
- [x] 1.3 Export round trip: extend the `internal/httpapi` export test and the `internal/importer` own-export test so a row with `language: "de"` is exported and restored. Verify with `go test ./...`.
- [x] 1.4 Document the field in the `docs/sync.md` entity table and the `user_prefs` paragraph. Verify with `npm run docs:check` in web/.

## 2. Message layer (design D2, D3, D4, D6)

- [x] 2.1 `web/src/lib/i18n/format.ts`: parser and formatter for the ICU subset (`{name}`, `plural` with `=0`/`one`/`other`/`#`, `select`), per-message cache, `Intl.PluralRules` categories, `formatNumber`. Verify with unit tests for each construct in English, German and French, malformed input, and a snapshot of `'{n, plural, one {# task} other {# tasks}}'` for 0, 1 and 2.
- [x] 2.2 `web/src/lib/i18n/catalog.ts`: `import.meta.glob` loader over `web/src/locales/*.json`, the shipped list in `web/src/locales/index.ts`, `t()`, `t.rich()`, `<T>`, the context suffix, English pass-through and missing-entry fallback, the `localStorage` mirror `opentodo.lang`, and setting `document.documentElement.lang`. Verify with tests for fallback, context keys, rich tags, and `lang` set before resolution; and `npm run build` shows one chunk per catalog.
- [x] 2.3 `web/src/lib/i18n/locale.ts`: resolve `system` from `navigator.languages`, keep the browser's region for the chosen language, and `preferredLanguages()` for quick add and voice. Verify with tests for `de-CH` + German → `de-CH`, `en-US` + German → `de`, Japanese + `system` → `en`.
- [x] 2.4 `LanguageProvider` next to `DateTimePrefsProvider` in `App.tsx` (live query on `userPrefs`, catalog load on change, context version) and `useT()`; `main.tsx` awaits the mirrored catalog before the first render. Verify with a component test that a written `language` op re-renders a translated label without a reload, and that a failed catalog load keeps the previous language and exposes the failure.
- [x] 2.5 `web/src/lib/i18n/errors.ts`: `errorMessage(code, fallback)` over the 71 server codes, with a test that every code in `internal/httpapi` (`writeError` calls, listed by a small Go test that writes them to a fixture) has an entry, and unknown codes return the fallback. Verify with `go test ./internal/httpapi/...` and `npm test`.

## 3. Extraction and checks (design D8)

- [x] 3.1 `scripts/i18n/extract.mjs` with the TypeScript compiler API: collect messages from `t(`, `t.rich(`, `<T>`, the error table and the lib helpers; `--write` refreshes `web/src/locales/messages.json`. Verify with `scripts/i18n/extract.test.mjs` on a fixture file (plain, context, rich, plural).
- [x] 3.2 `scripts/i18n-check.mjs` and `make i18n-check` (added to `check`): missing and unused keys per shipped catalog, parse errors, placeholder and plural-category mismatches, summary lines for work-in-progress catalogs. Verify with `scripts/i18n-check.test.mjs` (a dropped `{name}` fails, an incomplete unlisted catalog only reports) and `make i18n-check`.
- [x] 3.3 Untranslated-string pass in `scripts/ui-check.mjs` over `web/src/app` and `web/src/ui` (JSX text with words, the listed string props and `SettingRow`/`SettingsSection` fields) with `scripts/i18n/allow.txt`. Verify with a test that a planted `<button>Save</button>` fails with `file:line`, an allow-listed `OpenTodo` passes, and `t('Save')` passes; `make ui-lint` is red until group 4 completes.
- [x] 3.4 Document both checks in `scripts/README.md`. Verify with `npm run docs:check` (links) and that the documented commands run as written.

## 4. Migrate the strings (design D12)

- [x] 4.1 Shell, sidebar, views and quick add: `Shell.tsx`, `Sidebar.tsx`, `TaskListView.tsx`, `TaskRow.tsx`, `BoardView.tsx`, `CalendarView.tsx`, `DashboardView.tsx`, `FilterView.tsx`, `SavedViewView.tsx`, `ViewsView.tsx`, `LabelsView.tsx`, `TrashView.tsx`, `FeedView.tsx`, `QuickAdd.tsx`, `ShortcutHelp.tsx`, `NotificationBell.tsx`, `SyncStatus.tsx`, `listActions.ts`, `vim/`; plurals become ICU messages. Verify with the existing tests plus `npm test`, `npm run build`, and `make ui-lint` reporting no problem in these files.
- [x] 4.2 Task detail and pickers: `task-detail/`, `DueField.tsx`, `RemindersField.tsx`, `RecurrenceField.tsx`, `EstimateField.tsx`, `LabelPicker.tsx`, `AssigneePicker.tsx`, `ProjectPickerField.tsx`, `NotesEditor.tsx`, `HistoryPanel.tsx`, `ActivityPanel.tsx`, `ReminderToasts.tsx`, `datetime/`, `overlay/`, `Sections.tsx`, `SubProjects.tsx`, `ArchivePrompt.tsx`, `ShareDialog.tsx`, `MembersPanel.tsx`. Verify as 4.1.
- [x] 4.3 Settings: `SettingsView.tsx`, `settingsSections.ts`, `PreferencesPanels.tsx`, `DateTimeSettings.tsx`, `CalendarSettings.tsx`, `QuickAddSettings.tsx`, `VoiceSettings.tsx`, `CaptureSettings.tsx`, `NotificationsSettings.tsx`, `AccountSettings.tsx`, `SecurityPanel.tsx`, `TwoFactorPanel.tsx`, `PasswordSection.tsx`, `EncryptionPanel.tsx`, `DataSettings.tsx`, `BackupsPanel.tsx`, `CaldavPanel.tsx`, `WebhooksPanel.tsx`, `TokensSection.tsx`, `EmailInboxPanel.tsx`, `UsersPanel.tsx`, `InviteLinksSection.tsx`, `ProjectInvitePolicyPanel.tsx`, `SsoPanel.tsx`, `AuditPanel.tsx`, `AssistantsPanel.tsx`, `assistant/`, `ConfigWarnings.tsx`, `ProjectsSettings.tsx`, `ArchivedProjects.tsx`; "Settings → …" paths composed from the translated section names. Verify as 4.1, plus the settings stories still render.
- [x] 4.4 Account, invite and capture screens: `AuthScreen.tsx`, `ResetScreen.tsx`, `InviteScreen.tsx`, `ProjectInviteScreen.tsx`, `UnlockScreen.tsx`, `ReauthDialog.tsx`, `NamePrompt.tsx`, `ShareCapture.tsx`, `ImportScreen.tsx`, `ErrorBoundary.tsx`, `help/` (chrome only; content stays English); every `ApiError.message` consumer goes through `errorMessage()`. Verify as 4.1 and with the `web-app` scenarios (German `invalid_credentials`, unknown code verbatim) as tests.
- [x] 4.5 Shared UI and lib helpers: `web/src/ui` (Combobox, Field, Menu, Switch, patterns, Avatar), `lib/dates.ts` relative words, `lib/history.ts`, `lib/activity.ts` and `lib/feed.ts` wording, `lib/labels.ts`, `lib/webhooks.ts`, `lib/backups.ts`, `lib/assistant*.ts` user-facing text (model-facing text stays English and is allow-listed), `lib/shortcuts.ts` rendered through `t()` with the source kept English for the keyboard guide. Verify as 4.1, `make docs` produces no diff in `docs/keyboard.md`, and `make ui-lint` is green with `scripts/i18n/allow.txt` holding only the documented exceptions.

## 5. Dates, quick add and voice (design D4, D5)

- [x] 5.1 `lib/dates.ts`: `fmt()` and `systemDateTime()` take the resolved locale, caches keyed by it, `setDateTime()` re-run on language change by `DateTimePrefsProvider`. Verify with tests for the three `date-time-preferences` scenarios (`14.10.2026`/`15:00`/Monday for `en-US` + German, `de-CH` kept, French `3 nov.` and `mardi 3 nov.`, Spanish `3:00 p. m.`) and the existing `system` snapshots unchanged for `system` language.
- [x] 5.2 `resolveLanguages(settings, browser, language)` in `lib/nlp/settings.ts` and the five `navigator.languages` readers switched to `preferredLanguages()`; the quick-add settings panel names the preference in its "Follow browser languages" line. Verify with tests for the two `natural-language-capture` scenarios (Spanish first with `en-US`; device override wins) and `voiceCapture.test.tsx` showing dictation defaults to Spanish.
- [x] 5.3 Update `docs/quick-add.md` (Languages, Voice) and `docs/settings.md` (Capture) for the new order. Verify with `npm run docs:check`.

## 6. Catalogs and the translation workflow (design D3, D8)

- [x] 6.1 Write `web/src/locales/de.json`, `fr.json`, `es.json`, `it.json`, `pt.json` by hand from `messages.json`, reviewed by a speaker of each; list them in `web/src/locales/index.ts`. Verify with `make i18n-check` reporting every shipped catalog complete and `npm run build` emitting five catalog chunks of the sizes recorded in design.md (within 20 %). What could not be run here is recorded in `notes.md`.
- [x] 6.2 Write `docs/translating.md` (contributor audience): the source-text convention, `t()`/`<T>`/context/plural examples, the catalog format, adding a language (file, `index.ts`, maintainer, review by a speaker, no machine translation), the two checks and the allow-list, the glossary of product terms per language; link it from `CONTRIBUTING.md`, `docs/README.md` (Internals) and the README feature list. Verify with `npm run docs:build` and `npm run docs:check`.

## 7. Push notification text (design D7)

- [x] 7.1 `web/public/push-sw.js`: read `language` with the preferences row, an inline table for the nine texts in the six languages, `formatDue` with the resolved locale. Verify with `pushWorker.test.ts` extended to pin every table entry to the catalogs and to produce `Fällig 3. Nov., 15:00` with `10 Min. später` / `Verwerfen` for German day-month, and English when the row is missing.
- [x] 7.2 Update `docs/notifications.md` and `docs/reminders.md` (notification text follows the language). Verify with `npm run docs:check`.

## 8. Settings panel and Help note (design D9)

- [x] 8.1 `LanguageSection` in `PreferencesPanels.tsx` (select with `System (<name>)` and the shipped languages in their own names, load status and failure, writes through `setUserPref`, Help link `settings/language`), the section description in `settingsSections.ts`, and a story in `appSettings.stories.tsx`. Verify with a component test that picking `Deutsch` re-renders the page in German without a reload and that a failed load shows the message, plus the `settingsSections` test.
- [x] 8.2 Help note in `HelpPanel.tsx` and `HelpView.tsx` when the language is not English. Verify with `help.test.tsx` (note present in French, absent in English).
- [x] 8.3 Document the panel in `docs/settings.md` (Preferences → Language, with the English-guide note) and add the help id. Verify with `npm run docs:check`.

## 9. Browser extension (design D10)

- [x] 9.1 `extension/_locales/{en,de,fr,es,it,pt}/messages.json`, `default_locale` and `__MSG_…__` in `manifest.json`, `getMessage` in `background.js` and `options.js`, `data-i18n` in `options.html`; `EXT_FILES` in `Makefile` adds `_locales`. Verify with `extension/locales.test.js` (every locale has every `en` key, no extra keys) run by `make test-extension`, and `make extension` zips `_locales`.
- [x] 9.2 Update `docs/capture.md` (extension languages follow the browser). Verify with `npm run docs:check`.

## 10. Workbench (design D11)

- [x] 10.1 `locale` global in `web/.storybook/preview.tsx` loading the catalog through the same loader and setting `lang` on the frame; the a11y gate and baselines stay English. Verify with `npm run build-storybook` and `scripts/ui-check/a11y.mjs` passing unchanged, and the settings-section story readable in German at phone width by hand. What could not be run here is recorded in `notes.md`.
- [x] 10.2 Document the switch in `docs/design-system.md` (The workbench). Verify with `npm run docs:check`.

## 11. Integration

- [x] 11.1 Layout check in German: `scripts/e2e-layout.mjs` accepts `OPENTODO_LANG` and writes the preference before capturing; run `make layout-check` with `OPENTODO_LANG=de` and `ENGINES=chromium`, fix every overflow it names. Verify the run passes. What could not be run here is recorded in `notes.md`.
- [x] 11.2 Manual smoke on `make dev`: pick French on one browser profile, check the sidebar, Today, a task's detail and reminders, Settings, the `?` overlay, a sign-in error, a push notification on an installed build; confirm a second profile signed into the same account switches after sync and that switching offline in the installed app works. Record the result in the change folder notes. What could not be run here is recorded in `notes.md`.
- [x] 11.3 Run `make check` (go test, web test and build, `ui-lint`, `i18n-check`, docs check, openspec validate). Verify it passes.

## Workflow follow-up

- Move ROADMAP.md row 10 ("The app in your language", `app-localization`) from "Next: Parity and depth" to the shipped tables.
- Add a CHANGELOG.md entry under Unreleased (Added: interface in six languages; note the extension, push texts, and that docs and Help stay English).
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
