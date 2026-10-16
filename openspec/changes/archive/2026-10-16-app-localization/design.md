# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Every user-facing string is a literal where it is rendered.** 168 `.tsx` files under `web/src/app` and `web/src/ui`; a rough count gives about 850 JSX text nodes, 225 `aria-label`, 210 `title` and 75 `placeholder` attributes, and about 570 sentence-like literals in `web/src/lib` (due labels in `lib/dates.ts`, history wording in `lib/history.ts`, activity in `lib/activity.ts`, label and webhook texts). Around 40 sites build plurals by hand (`n === 1 ? 'task' : 'tasks'`). The densest files are `ImportScreen.tsx`, `TwoFactorPanel.tsx`, `ProjectInviteScreen.tsx`, `BackupsPanel.tsx`, `AuditPanel.tsx` and `EncryptionPanel.tsx`.
- **There is one synced personal preference row** (`user_prefs`, id `"me"`, `date-time-preferences` D1): `internal/sync/ops.go:264`, `web/src/lib/types.ts:225`, defaults at `web/src/lib/ops.ts:86`, read by `DateTimePrefsProvider.tsx` with `useLiveQuery`, exported whole by `handleExport` (`internal/httpapi/server.go:1593`) and restored by the importer (`internal/importer/profile_opentodo.go:41`). The service worker already reads it from IndexedDB (`web/public/push-sw.js:62-69`).
- **Dates use the bare browser locale.** `lib/dates.ts` builds every `Intl.DateTimeFormat` with locale `undefined` (`fmt()` at line 388, and `systemDateTime()` at line 336 derives order, hour cycle and week start from it). `push-sw.js:197-204` does the same inline.
- **Five places read `navigator.languages`** for quick add and voice: `QuickAdd.tsx:32`, `QuickAddSettings.tsx:26`, `VoiceSettings.tsx:38`, `useDictation.ts:10`, `datetime/DateField.tsx:32`; all feed `resolveLanguages(settings, browser)` in `lib/nlp/settings.ts`, which keeps the device override first.
- **Server text.** Errors are `writeError(w, status, code, message)` (`internal/httpapi/server.go:1636`), 71 distinct codes with English messages, and the client surfaces `ApiError.message` directly (`AuthScreen.tsx:153,427`). Push payloads carry ids and an optional title (`internal/push/service.go:105-119`); in-app notifications carry a structured payload that `NotificationBell.tsx:55-60` turns into English sentences. CalDAV has no prose, email to task sends nothing back, `ot` and MCP are English contracts.
- **Checks.** `scripts/ui-check.mjs` (run by `make ui-lint` inside `make check`) already walks `web/src/app` line by line and reports `file:line` problems for glyph icons; `web/src/ui/tokens/lint.test.ts` is the other source lint. `typescript` is a devDependency, so a real parser for extraction is available at no cost. The CSP forbids inline scripts (`server.go:453`), so nothing can run before `main.tsx`.
- **The workbench** has `theme` and `width` globals in `web/.storybook/preview.tsx`; the a11y gate and the visual baselines run on every story in two themes.
- **The extension** is plain MV3 (`extension/manifest.json`, `options.html`, `options.js`, `background.js:13` creates the menu title) with its files listed in `Makefile` `EXT_FILES`.
- **`web/index.html` hard-codes `lang="en"`.**

## Goals / Non-Goals

**Goals:**
- One message layer that every rendered string goes through, enforced by a lint so the tree cannot regress.
- No runtime dependency: a formatter small enough to read in one sitting, `Intl` for plurals, numbers and dates.
- The six catalogs complete and human-written in the repository, with a contributor workflow that a community catalog can follow without help from a maintainer.
- Language chosen once, synced, offline-capable, applied without a reload, and correct at first paint.

**Non-Goals:**
- Translating the server, the CLI, docs, Help content, the demo data or the website.
- Right-to-left layout (`dir`), locale-specific sorting (collation stays the engine's default), or a per-device language.
- A translation platform integration (Weblate, Crowdin). The JSON files are the interface; a platform can be added later without changing them.

## Decisions

### D1. Storage: an additive `language` field on `user_prefs`

`language` is a `kString` field on the existing `user_prefs` entity, written with entityId `"me"` through `mutate()` like `date_format`. Values are `system` or a BCP 47 primary language subtag from the shipped list (`de`, `fr`, `es`, `it`, `pt`, `en`); clients map anything else to `system` on read without rewriting it, so a catalog added later stays additive. Per-field last-writer-wins gives convergence; the outbox gives offline. The row is already exported and re-imported whole, so the preference is in the export with no further work. It is not user-written content, so it stays out of `e2ee.ContentFields` and `CONTENT_FIELDS`. No Dexie version bump: the table is the same, the row gains a key.

- **Alternative: a per-device setting (`localStorage`, like quick-add languages).** Rejected. The roadmap row says "synced like the date format", and a language is a property of the person. The browser default covers the "my phone is German, my laptop English" case for anyone who never picks.
- **Alternative: a server-side user setting with a REST route.** Rejected: a route, an offline gap and a second sync path, against the ops rule. The server can still read the row when it needs it (`outgoing-email`).
- **Alternative: a region-qualified value (`de-CH`).** Rejected. The catalogs are per language; the region only matters for `Intl`, and the browser already supplies it (D4).

**Data model impact:** one new string field on an existing entity; no field renamed or retyped. `theming` appends two more fields to the same entity; both changes add lines to the same `Schema` block and defaults object and merge in any order.

### D2. Message layer: English source text as the message id, an ICU subset, no library

`web/src/lib/i18n/` provides:

```
t(message, values?)            // 'Snooze 10 min', '{n, plural, one {# task} other {# tasks}}'
<T>…</T> / t.rich(message, { b: (s) => <strong>{s}</strong> })   // markup inside a message
useT()                         // the hook that re-renders on language change
formatNumber(n)                // Intl.NumberFormat in the active locale
```

The message id is the English text itself, as gettext and Lingui do. The code stays readable, English needs no catalog, the extractor needs no naming convention, and a translator sees the real sentence. Messages use a subset of ICU MessageFormat: `{name}` placeholders, `{n, plural, …}` with `=0`, `one`, `other` and `#`, and `{x, select, …}`. The parser and formatter are about 150 lines, cached per message; plural categories come from `Intl.PluralRules` (zero bytes, in every browser the app supports). Rich messages take tags (`<b>…</b>`) mapped to render functions, so a sentence with a link or emphasis is one translatable unit instead of three fragments. A context suffix (`t('Open', { context: 'verb' })`) disambiguates the rare homonym; the extractor keys it as `Open|verb`.

- **Alternative: react-intl or i18next.** Rejected under "keep it small": 15 to 40 KB gzipped at runtime for features the app does not use (date skeletons, nested namespaces, backends), and a dependency to justify in every design doc after this one.
- **Alternative: Lingui (compile-time catalogs, macro).** Closest in spirit, but it brings a Babel macro, a CLI and a runtime (`@lingui/core` about 5 KB), and the Vite React plugin would need its Babel configuration. The hand-written layer covers the same surface in fewer lines than Lingui's configuration.
- **Alternative: stable keys (`settings.language.title`).** Rejected. Every string would need a name invented once and remembered forever, the English catalog would become a second source of truth, and the extractor could not catch an untranslated literal by its shape.

### D3. Catalogs: one JSON per language, a Vite chunk each, chosen before first render

`web/src/locales/<lang>.json` maps source message to translation (`{"Snooze 10 min": "10 Min. später"}`, with `|context` keys where used). The loader uses `import.meta.glob('../locales/*.json')`, so Vite emits one chunk per language that the service worker precaches with the shell (`globPatterns` already matches `*.js`). The loader keeps one catalog in memory and swaps it on change; a missing entry returns the source text.

Choice at startup: `main.tsx` reads the last applied language from `localStorage` (`opentodo.lang`, a per-viewer convenience like the Vim flag), awaits that catalog, sets `document.documentElement.lang` and only then renders, so there is no flash of English. A `LanguageProvider` next to `DateTimePrefsProvider` then subscribes to the `userPrefs` row; when the synced value differs (first sign-in on a new device, a change on another device), it loads the catalog, updates `localStorage` and `lang`, and bumps a context version so every `useT()` consumer re-renders. Pure helpers in `web/src/lib` (due labels, history wording, activity text) read the module-level catalog, as the date formatters read their snapshot. If the catalog fetch fails (not installed, offline, nothing cached), the current language stays, the Language panel shows the failure, and the preference stays stored; the next successful load applies it.

The shipped list is the catalogs named in `web/src/locales/index.ts`. A catalog present in the folder but not in the list is work in progress: it is checked and reported but never offered.

- **Alternative: bundle all catalogs in the main chunk.** Rejected: five catalogs are about 150 KB gzipped that an English user never needs.
- **Alternative: fetch catalogs from a CDN.** Rejected outright: no third-party network calls.

### D4. Locale resolution for `Intl`: language from the preference, region from the browser

`lib/i18n/locale.ts` resolves the active locale once per language change: with `system`, `navigator.languages[0]` as today; otherwise the chosen language plus the region of the first browser entry with that language (`de-CH` for a Swiss browser that chose German), else the bare language. `lib/dates.ts` takes it: `fmt()` and `systemDateTime()` receive the locale, their caches are keyed by it, and `setDateTime()` is re-run on a language change so `system` date, time and week-start values resolve from the right locale. `DateTimePrefsProvider` already recomputes on row changes; it adds the locale to its key. `push-sw.js` passes the stored language to its inline `formatDue` in the same way.

- **Alternative: keep month and weekday names on the browser locale.** Rejected: "Mittwoch 14 Oct" is wrong in both languages, and a user who chose the language chose it for all text.

### D5. Quick add and voice: the preference becomes the first active language

`resolveLanguages(settings, browser)` grows a third argument: `resolveLanguages(settings, browser, language)`. A device override still wins; otherwise the active list is `[language, ...browser]` reduced to bundled codes with English last. The five `navigator.languages` readers call one helper `preferredLanguages()` in `lib/i18n` that already prepends the preference, so `QuickAdd`, the quick-add settings panel (which shows "Follow browser languages (Deutsch, en-US, …)"), the voice recognition default (`voice-capture` "Recognition language" is unchanged: it still follows the first active quick-add language) and `DateField` phrase parsing agree. Parsing stays a pure function of its inputs; the preference is one of them and synced, so the determinism requirement holds.

### D6. What the server keeps in English, and how the client copes

Inventory and decision:
- **Error envelope messages** stay English. The client gets `errorMessage(code, fallback)` in `lib/i18n/errors.ts`: a table of the 71 codes with translatable messages, falling back to the server's message. Screens that show `ApiError.message` go through it; `web-app` "Account screens" is modified accordingly. The interpolated assistant allowance message (`assistant.go:565`) is shown verbatim, as an unknown code would be.
- **In-app notifications** (`assigned`, `mentioned`) carry a structured payload; the client builds the sentence, so it is translated by D2.
- **Push payloads** carry ids and optionally the title; text is built on the device (D7).
- **CalDAV, webhooks, REST, MCP, `ot`, the assistant's prompts and tool descriptions** are machine contracts and stay English. Email to task sends no replies today; `outgoing-email` owns mail templates and can read `user_prefs.language` on the server.
- **Demo seed data** stays English (out of scope).

### D7. Service worker: an inline table for its nine strings

`push-sw.js` runs outside the Vite graph, so it cannot import the catalogs. It holds a small table (`{en: {...}, de: {...}, …}`) for its nine texts ("Reminder", "Due {date}", "You have a reminder", "Snooze 10 min", "Dismiss", the test notification texts) keyed by the `language` read from the `userPrefs` row it already opens; a missing row or `system` falls back to English, because the worker cannot know the browser's resolved choice reliably and a reminder body in the wrong language is worse than English. A vitest loads the worker, asserts the table covers every shipped language with every key, and pins each entry to the main catalog's translation of the same source text, the same way `pushWorker.test.ts` pins `formatDue` to `lib/dates.ts`.

- **Alternative: have the app post the translated strings to the worker.** Rejected: the worker must work when no window is open.

### D8. Checks: an untranslated-string lint in `ui-check.mjs` and a catalog check in `i18n-check.mjs`

- **Untranslated strings.** `scripts/ui-check.mjs` gains a third pass over `web/src/app` and `web/src/ui` (`.tsx`, not stories or tests): JSX text containing a word of three or more letters, and string values of `aria-label`, `title`, `placeholder`, `label`, `description`, `alt` props and of the `label`/`description` fields passed to `SettingRow`/`SettingsSection`, must appear inside `t(`, `<T>` or `t.rich(`. The pass uses the TypeScript compiler API (`ts.createSourceFile`, a JSX-aware walk) rather than the line regexes of the glyph pass, because attribute strings span lines. Problems print as `file:line` like the glyph pass. `scripts/i18n/allow.txt` lists permanent exceptions by file and literal: proper nouns (`OpenTodo`, `CalDAV`, `Coolify`), codes and examples (`p1`, `#work`, `2026-11-03`), and key names in the `kbd` spans. The allow-list is reviewed like code.
- **Catalogs.** `scripts/i18n/extract.mjs` collects every message from the tree with the same parser (first argument of `t(` and `t.rich(`, children of `<T>`, entries of the error table and of the lib helpers' message arrays) into a sorted list. `scripts/i18n-check.mjs` (`make i18n-check`, in `make check`) then checks each shipped catalog for missing and unused keys, parses every source and translated message with the D2 parser, and compares placeholder and plural-category sets. A work-in-progress catalog is reported as a summary line (`pl: 412 of 1480`) without failing. `extract.mjs --write` refreshes `web/src/locales/messages.json` (the sorted source list with file references) for translators and the catalog diff in reviews.
- **Tests** for both scripts live beside them (`*.test.mjs`, already in the vitest include pattern): a planted literal fails, an allow-listed one passes, a dropped placeholder fails.

- **Alternative: an ESLint rule.** Rejected: the project has no ESLint, and adding it for one rule brings a toolchain. The TypeScript API is already installed.

### D9. Settings panel, `lang`, and the Help note

A `LanguageSection` in `PreferencesPanels.tsx` (Settings → Preferences, after Date and time): one labelled select with `System (<resolved name>)` first and the shipped languages in their own names, written through `setUserPref('language', …)`; an inline status while a catalog loads and a visible failure if it cannot. Help link and screen id `settings/language`; `settingsSections.ts` description gains "language". Not on the demo deny list: a personal op with no outbound effect. `document.documentElement.lang` is set by the loader (D3); `dir` is never touched. `HelpPanel.tsx` and `HelpView.tsx` render a one-line note from the catalog above the English content when the active language is not `en`.

### D10. Extension: MV3 `_locales`, following the browser

`extension/_locales/<lang>/messages.json` for the six languages; `manifest.json` gains `default_locale: "en"` and uses `__MSG_name__`, `__MSG_description__`, `__MSG_actionTitle__`, `__MSG_commandDescription__`; `background.js` and `options.js` call `ext.i18n.getMessage(...)`, and `options.html` carries `data-i18n` attributes filled on load. The browser picks the locale, so the extension still stores nothing but the server URL and makes no request. `Makefile` `EXT_FILES` adds `_locales`, and `extension/locales.test.js` (run by `make test-extension`) checks that every locale has every key of `en`.

### D11. Workbench: a `locale` global

`web/.storybook/preview.tsx` adds a `locale` toolbar global with the shipped languages; the decorator loads that catalog through the same loader and sets `lang` on the frame. The a11y gate and the visual baselines keep running in English only: six languages would multiply CI time and baseline images for little gain, while the switch lets a contributor look at German lengths at phone width by hand.

### D12. Migration of the call sites

The migration is mechanical and large (about 1,900 occurrences). It is done inside this change, grouped by area (tasks.md group 4), with the lint turned on from the start and its allow-list used only for the permanent exceptions. Plurals built with `n === 1 ? … : …` become one ICU plural message. Shortcut descriptions in `lib/shortcuts.ts` stay English source text (the keyboard guide is generated from them) and are translated at render. `Settings → …` paths in messages are composed from the translated section names so they match the sidebar.

## Risks / Trade-offs

- **[German and French strings are 20 to 30 % longer; buttons and settings rows may wrap or overflow at 360 px]** → Group 10 runs the layout check (`scripts/e2e-layout.mjs`) with the language set to German, which is the longest, before the change closes; the Storybook locale switch covers primitives.
- **[A catalog falls out of date as screens change]** → `make i18n-check` in `make check` fails on any missing or unused key, so a pull request cannot add a string without its five translations. The cost is on every contributor; the translating page tells them to add the keys with their best effort and ask a reviewer who speaks the language, which is how the quick-add vocabularies are maintained today.
- **[Source-text ids change when English copy is edited, orphaning translations]** → `extract.mjs --write` produces a diff that shows the old and new source side by side; reviewers move translations rather than retranslate. Accepted: it is the price of ids that stay readable, and it keeps copy edits visible.
- **[Flash of English on first load of a new device]** → Unavoidable before the first sync of the row; after that `localStorage` carries the last language to first paint (D3). The sign-in screen itself follows `system`, which is the browser language, so most people never see it.
- **[Translation quality]** → Shipped catalogs are human-written and reviewed by a speaker; machine translation is refused in review. The in-repo six have maintainers named in `docs/translating.md`.
- **[The service worker table and the catalogs drift]** → The pinning test in D7 fails when they differ.
- **[Two sources of per-user language (synced row, `localStorage` mirror)]** → The mirror is write-only from the row and never synced; it only decides the first paint, and the row wins as soon as it is read.
- **[Older server rejects the field]** → Same as every additive field: the op is rejected as invalid by an older server, the client keeps its local value, and the setting works on that device until the server is upgraded. The release notes say so.

**Size:** no dependency. Formatter, loader and provider about 2 KB gzipped in the main chunk; `t()` call wrappers under 2 KB. Each non-English catalog about 130 KB raw (1,500 messages with English keys), 25 to 30 KB gzipped, loaded only when chosen. `internal/web/dist`, and so the binary and container image, grow by about 0.7 MB for five catalogs; runtime memory on the server is unchanged (the embed is read from the file system). Client memory: one catalog's strings when a non-English language is active. The extension zip grows by about 10 KB.

## Migration Plan

No data migration. A missing `language` means `system`, which renders what the app renders today for an English browser. Rollback is shipping the previous binary: older clients ignore the field, the server rejects new `language` ops while existing rows stay inert, and `localStorage` `opentodo.lang` is ignored by an older build.

## Open Questions

- Should the in-app assistant's system prompt name the user's interface language so its replies come in it? It needs no spec change (the assistant answers in the language it is addressed in today) and can be added in the assistant's own change.
- Should `ot` share the catalogs later for its interactive prompts? Its JSON contract stays English either way; a separate change can decide.
