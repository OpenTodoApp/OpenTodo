# Proposal

## Why

The interface is English only. Every label, button, menu, placeholder, `aria-label`, toast and error in `web/src/app` and `web/src/ui` is a literal in the source (about 850 JSX text nodes, 225 `aria-label`, 210 `title`, 75 `placeholder` and roughly 570 user-facing string literals in `web/src/lib`, around 1,500 distinct messages), the service worker writes "Snooze 10 min" and "Due …" by hand (`web/public/push-sw.js:232-243`), and the browser extension's manifest and options page are English (`extension/manifest.json`, `extension/options.html`). Quick add already understands six languages (`web/src/lib/nlp/vocab/`), so a German household can type "Zahnarzt nächsten Mittwoch" into an app that answers "Due Wed 15 Oct". Todoist ships about twenty languages; ROADMAP row 10 calls this the most visible parity gap for non-English households.

## What Changes

- **A language preference.** Each user chooses the interface language once: `system` (default, the browser's language when it is one the app ships, else English) or one of the shipped languages. It is a new field `language` on the synced personal `user_prefs` entity (OpenSpec `date-time-preferences`), written as an op, so it reaches every device of the user, works offline and converges per field by last-writer-wins. Unknown values read as `system`.
- **Six languages maintained in the repository:** English (the source text), German, French, Spanish, Italian and Portuguese, the quick-add languages. Community catalogs follow the same workflow and are offered in Settings only when complete.
- **Message catalogs lazy-loaded per language.** English is the source text in the code; every other language is one JSON catalog that becomes its own chunk, loaded only when chosen and precached by the service worker like any chunk, so the installed app switches language offline. The runtime is a small hand-written formatter (placeholders, plural and select with `Intl.PluralRules`); no library.
- **Everything the client renders follows the language:** views, menus, dialogs, Settings, toasts, the `?` overlay, screen-reader labels, placeholders, tooltips, relative date words ("Today", "Tomorrow") and the activity and history wording. The document's `lang` attribute follows too.
- **Dates and numbers follow the language.** Month and weekday names, and what `system` means for the date and time preferences, come from the interface language's locale instead of the bare browser locale (the browser's region is kept when it matches the language, so `de-CH` stays `de-CH`). Plural forms use `Intl.PluralRules`.
- **Quick add and voice preselect the language.** The interface language becomes the first active quick-add language (English stays always on, the per-device override stays), so dictation listens in it too without a change to `voice-capture`.
- **Server errors translated by code.** The server keeps its JSON envelope `{error:{code,message}}` in English; the client translates the codes it knows and shows the server's message verbatim for the rest.
- **Push notifications on the device.** The service worker reads the stored language with the date preferences it already reads and builds "Due …", "Snooze 10 min", "Dismiss" and the fallback texts in that language.
- **Browser extension.** MV3 `_locales` for the six languages; it follows the browser's interface language, because it stores only the server URL and never learns the account's preference.
- **Checks.** `make ui-lint` fails on a new untranslated user-facing string in `web/src/app` and `web/src/ui` (with a documented allow-list), and a new `make i18n-check` fails when a shipped catalog misses or no longer needs a message, has a malformed message or mismatched placeholders. Both run in `make check`.
- **Workbench.** Storybook gets a locale switch next to the theme switch, so every story can be viewed in each shipped language.
- **Settings → Preferences → Language** panel, applied without a reload, with a Help link.
- **Translation workflow** for contributors: a page in `docs/` explaining the source-text convention, the catalog format, how to add a language, the checks, and the rule that shipped catalogs are written and reviewed by people, never machine-translated.

Out of scope, and why:
- **Server-rendered text stays English:** the error messages in the JSON envelope (a machine contract; the client translates by code), CalDAV (protocol only, calendars are named after projects), email to task (it sends no replies), webhooks, the REST API, MCP, the in-app assistant's prompts, and the `ot` command line (`internal/cli`, a scripting tool with a JSON contract). Push payloads carry ids and optionally the task title, never text to translate.
- **Docs and in-app Help stay English for now** (ROADMAP row 10). Help shows, in the user's language, that the guide is in English.
- **Right-to-left layout.** The `dir` attribute is left alone; an RTL language needs its own change for mirrored layout and icons.
- **Translated demo seed data, the website, the Coolify template and the docs site.**
- **Per-device language.** Like the date format, the language is a property of the person. The browser's language is the default, which covers the per-device case for anyone who never picks one.
- **Outgoing email templates** belong to `outgoing-email`; once this change lands, that change can read the recipient's `user_prefs.language` on the server the way the export handler reads the row (`internal/httpapi/server.go:1593`).

ROADMAP: advances row 10 of "Next: Parity and depth", "The app in your language" (`app-localization`). Archiving moves it to the shipped tables.

Nothing here is **BREAKING**. The op log gains one additive string field on an existing entity. No environment variable, no route, no migration.

Coordination: `theming` also adds fields to `user_prefs` (`theme_mode`, `theme_accent`); both changes only append to the same `Schema` entry and defaults, so they merge in any order.

## Capabilities

### New Capabilities
- `localization`: the interface language preference, its storage and sync, the shipped languages and their catalogs, lazy loading and offline behaviour, fallback to English, plurals and the document language, translated server error codes, the Settings panel, the Help note, and the checks that keep catalogs complete and new strings translated.

### Modified Capabilities
- `web-app`: "Account screens" shows server-side errors translated by code when known, verbatim otherwise.
- `date-time-preferences`: `system` and the month and weekday names follow the interface language's locale rather than the bare browser locale ("Date and time preferences", "Date format", "Time format").
- `natural-language-capture`: "Multi-language vocabulary": the interface language is the first active quick-add language.
- `settings-navigation`: "Help links name the same screens": section paths in UI text use the translated section names; screen ids stay language-independent (the English-guide note is specified in `localization`).
- `reminders`: "Push payload privacy": the device builds the notification text in the user's language as stored on that device.
- `share-capture`: a new requirement "Browser extension language": its texts follow the browser's interface language through MV3 locales (the existing "Browser extension" requirement is unchanged).
- `design-system`: "Design workbench": stories can be viewed in any shipped language.

## Impact

- **Op schema (additive):** `language` (`kString`) on `user_prefs` in `internal/sync/ops.go` `Schema` (line 264), `web/src/lib/types.ts` `UserPrefs` (line 225), the defaults in `web/src/lib/ops.ts` (line 86), `docs/sync.md` (entity table, line 83). Not user-written content, so not in `e2ee.ContentFields` or `CONTENT_FIELDS`. No Dexie table change (same row). The export already carries the whole row (`internal/httpapi/server.go:1593-1598`, `internal/importer/profile_opentodo.go:41`).
- **Web:** a new `web/src/lib/i18n/` module (formatter, catalog loader, locale resolution, React provider and hook); catalogs in `web/src/locales/*.json`; `web/src/lib/dates.ts` (`fmt()` at line 388 and `systemDateTime()` at line 336 take the resolved locale); `web/src/lib/nlp/settings.ts` `resolveLanguages`; `web/src/app/QuickAddSettings.tsx`, `VoiceSettings.tsx`, `useDictation.ts`, `datetime/DateField.tsx` (the five `navigator.languages` readers); `web/src/lib/api.ts` `ApiError` consumers; every file in `web/src/app` and `web/src/ui` with user-facing text; `web/index.html` `lang`; `web/public/push-sw.js`; `web/.storybook/preview.tsx`; `PreferencesPanels.tsx` and `settingsSections.ts`.
- **Checks and build:** `scripts/ui-check.mjs` (untranslated-string check), new `scripts/i18n-check.mjs` and `scripts/i18n/extract.mjs` (TypeScript compiler API, already a devDependency), `Makefile` (`i18n-check` in `check`, `_locales` in `EXT_FILES`), `.github/workflows/ci.yml` only through `make check`.
- **Extension:** `extension/_locales/<lang>/messages.json`, `manifest.json` (`default_locale`, `__MSG_…__`), `options.html`/`options.js`, `background.js` (context-menu title).
- **Server:** schema entry only. No new route, nothing for the demo deny list (a personal op with no outbound effect).
- **Docs:** `docs/settings.md` (Language), `docs/quick-add.md` (Languages), `docs/capture.md` (extension), `docs/sync.md`, `docs/notifications.md`, a new contributor page `docs/translating.md`, `CONTRIBUTING.md`, `README.md`, the help bundle.
- **Size:** no dependency. Runtime formatter and loader about 2 KB gzipped in the main chunk; `t()` call sites add under 2 KB. Each non-English catalog is a chunk of roughly 130 KB raw, 25 to 30 KB gzipped, fetched only when chosen. The embedded `internal/web/dist` and therefore the binary and container image grow by about 0.7 MB for five catalogs. Client memory: one catalog (a few hundred KB of strings) when a non-English language is active. Server memory unchanged.
