# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Every preference that exists today is per device and never synced.**
  - Calendar grid hours live in Dexie `meta` under `calendar.grid` (`lib/calendar.ts:166`, time-blocking D7).
  - Start view is in `meta` (`lib/views.ts:411`).
  - Quick add is in `localStorage` `opentodo.quickadd` (`lib/nlp/settings.ts`).
  - Vim mode is per device.

  None of them is something a person expects to differ between their phone and laptop the way date format is.
- **There is one precedent for synced personal preferences:** the `project_prefs` entity (activity-feed D1). It is written through the op log and resolves to the author's personal scope through the default branch of the scope resolver (`internal/sync/scope.go:290-296`, "Labels, saved views and reminders are personal… So are project_prefs"). On the client it is stored in the Dexie table `prefs`.
- **Formatting is scattered.** `lib/dates.ts` has `weekday`, `formatShort` and `formatDateHeading` (`toLocaleDateString(undefined, …)`), and about 30 components call `toLocale*String` directly: TaskConversation, FeedView, CalendarView, HistoryPanel via `lib/history.ts`, TrashView, SecurityPanel, TokensSection, BackupsPanel, ReminderToasts, RemindersField and others.
- **Week math assumes Monday** in `lib/calendar.ts:132` (`weekDates`) and in `lib/nlp/dates.ts:66-90` (`weekdayIndex`, "next <weekday>", "next week").
- **Quick add already has `dayMonthOrder: 'auto' | 'DM' | 'MD'`.** `'auto'` follows the first active language (`resolveDayMonthOrder`).
- **The push service worker builds the notification text itself.** `web/public/push-sw.js:166-170` reads the task from IndexedDB and writes `Due YYYY-MM-DD HH:MM`.
- **Native inputs:** `DueField.tsx:42-44` uses `type=date` and `type=time`; `RemindersField.tsx:193` uses `type=datetime-local`. Their display format belongs to the browser and OS and cannot be controlled.

## Goals / Non-Goals

**Goals:**
- One formatting API that every user-facing date and time goes through. Unit tests pin its output for each preference.
- Preferences that reach every device of the user with no new server code beyond a schema entry.
- Date and time entry controls that respect the formats and work fully by keyboard. Built here so this change stands alone; `ui-primitives` only restyles them later.

**Non-Goals:**
- Locale or translation work. Month and weekday names still come from `Intl` with the browser locale.
- Changing stored formats (`due` stays `{date, time?, tz?}`, instants stay Unix ms).
- Replacing date inputs outside task editing.

## Decisions

### D1. Storage: a synced personal `user_prefs` entity, keyed `"me"`

New entity `user_prefs` with `kString` fields `date_format`, `time_format` and `week_start`. Each client writes it with entityId `"me"`. The scope resolver's default branch already places unknown personal entities in the author's personal scope, so the server needs only the `Schema` entry. Personal scopes are per user, which makes the constant id safe: two users' `"me"` rows never meet. Values are enumerations carried as plain strings, like `view.kind` (custom-views): clients map unknown values to `system` when reading, so adding a value later stays additive. Per-field last-writer-wins on `(ts, device)` gives convergence, and offline edits go through the outbox like any op.

- **Alternative: a per-device `meta` or `localStorage` entry, like start view and the calendar grid.** Rejected. Date format is a property of the person, not the device. The user explicitly asked for it "in their settings", and having to set it on every device would read as a bug.
- **Alternative: server-side user settings behind a REST route (`/api/v1/me/...`).** Rejected. It adds an authenticated route, an offline gap and a second sync mechanism, against the "all data writes go through ops" rule.
- **Alternative: add fields to `project_prefs`.** Rejected. That entity is keyed by project.

**Data model impact:** one new entity, purely additive. No existing field is renamed or retyped. Dexie gets the next free version (v15 if `ui-primitives` has taken v14) with a new table `userPrefs: 'id'`, and every store is redeclared as the existing versions do. The entity goes into the maps in `lib/ops.ts` (table plus defaults), `lib/e2eeSync.ts` and `lib/assistant.ts` (`tableFor`), and into `docs/sync.md`. The values are not user-written content, so they stay out of `e2ee.ContentFields` and `CONTENT_FIELDS` and are stored in plaintext even for encrypted accounts, like `view.kind`. The entity is not added to `opsync.Plural`, so it gets no REST collection. It *is* included in the JSON export (decided during review, per the data-ownership principle that exports contain everything a user owns): the export handler adds a `user_prefs` array with the caller's row next to the `Plural` collections, and an export imported back into OpenTodo restores the preferences. `internal/activity` and `lib/activity.ts` must derive no event from it. A `user_prefs` op is added to the shared fixture to pin that.

### D2. One formatting module with a live snapshot

`lib/dates.ts` gains a `DateTimePrefs` type, a resolved form (`{order: 'DM'|'MD'|'YMD', hour12: boolean, weekStart: 0..6}`), and formatting functions:

```
formatDate(iso, style: 'compact' | 'numeric' | 'long' | 'heading')
formatTime('HH:MM')
formatInstant(ms, style: 'time' | 'datetime' | 'date')
weekStartOf(iso) / weekDays(iso)
```

Each function takes an optional resolved-prefs argument for tests and otherwise reads a module-level snapshot. A `DateTimePrefsProvider` at the app root does three things: it subscribes to the `userPrefs` row with `useLiveQuery`, resolves `system` values once (`Intl.DateTimeFormat().resolvedOptions().hourCycle`, `new Intl.Locale(navigator.language).getWeekInfo?.()` or `.weekInfo` with a Monday fallback, and the locale's date order derived from `formatToParts`), and publishes the result through a React context and the module snapshot. Components that render dates read the context (`useDateTimeFormat()`), so a change re-renders them without a reload. Pure helpers (`dueLabel`, `lib/history.ts`) take the snapshot.

The `Intl.DateTimeFormat` options map like this:
- `day-month` and `month-day` set `day`/`month` through `formatToParts` and reorder the parts, because no locale option forces the order.
- `iso` is built by hand (`YYYY-MM-DD`).
- The time format maps to `hourCycle: 'h12' | 'h23'`.

Formatters are cached per `(locale, prefs, style)`.

- **Alternative: pass a locale such as `en-GB` that happens to match.** Rejected. It changes month names and other wording the user didn't choose, and no locale matches every combination (for example, English month names with day-first order and a 12-hour clock).

### D3. Call-site migration with a lint guard

Every direct `toLocaleDateString`, `toLocaleString` and `toLocaleTimeString` call in `web/src/app` and in user-facing `web/src/lib` code is replaced with the D2 API. A vitest "guard" test greps the source tree and fails when a new direct `toLocale*String(` appears outside `lib/dates.ts` and an explicit allow-list. The allow-list covers machine or model-facing text, such as `lib/assistant.ts` `dueWords` (en-GB, intentionally fixed) and `lib/filter` internals that format for comparison, not display. This keeps the rule "every user-facing date follows the preference" true over time without an ESLint dependency; the project has none.

### D4. Date and time fields: a text field and a calendar popover, no dependency

New components in `web/src/app/datetime/`:

- **`DateField`:** a text input that shows `formatDate(value, 'numeric')`. On commit (Enter or blur) it parses, in order:
  1. ISO `YYYY-MM-DD`
  2. numeric dates in the resolved order, with 1–2 or 4 digit years and `/`, `.` or `-` separators, rolling forward like quick add
  3. relative words and weekday names, reusing the quick-add phrase grammar (`lib/nlp/dates.ts`) with the user's active languages and week start

  Invalid input shows an inline message (`aria-invalid`, `aria-describedby`) and keeps the old value. A calendar button, or Alt+Down, opens a `Popover` (`app/overlay`) with a month grid: `role=grid`, weeks starting at `weekStart`, arrows, Page Up/Down, Home/End, Enter and Escape, today and the selected day marked.
- **`TimeField`:** a text input that shows `formatTime`. It accepts `15`, `1530`, `15:30`, `3pm`, `3:30 pm` and `noon`, and offers a 15-minute suggestion list (a listbox on the same Popover).
- **`DueField` and `RemindersField`** both use them. The reminder entry becomes a DateField plus a TimeField instead of `datetime-local`, so the two fields finally share one control.

Native inputs stay available as the mobile fallback only through the text field's `inputmode` hints. They are not shown, because their format cannot be controlled.

- **Alternative: keep native inputs.** Rejected. They cannot follow the preference, which is exactly the user's complaint.
- **Alternative: a date-picker library** (react-day-picker, about 10–15 KB gzipped plus date-fns). Rejected under "keep it small". The grid and parser are about 300 lines.

The `ui-primitives` change may later restyle these on its Popover and Input primitives without changing behaviour.

### D5. Week start reaches the calendar and quick add as a parameter

- `weekDates(iso)` becomes `weekDates(iso, weekStart)`, and CalendarView passes the resolved value.
- The quick-add resolver context (`lib/nlp/dates.ts`) gains `weekStart`. "next week" becomes the first day of the following week, and the "next <weekday>" rule uses the week that contains today.

Parsing stays deterministic: the result depends only on the inputs, and the preference is one of them and synced. The natural-language-capture requirement "Same result on every device" therefore still holds across the user's devices.

### D6. Quick-add numeric order: the preference fills `'auto'`

`resolveDayMonthOrder(settings, langs, prefs)`:
- an explicit per-device `'DM'` or `'MD'` wins
- otherwise a `day-month` or `month-day` date format decides
- otherwise (`system`, `iso`) the language rule decides, as today

The per-device quick-add setting keeps its meaning, so nothing is migrated. The quick-add settings panel shows which source decided ("Automatic: day-month, from your date format").

### D7. Service worker reads the synced row

`push-sw.js` already opens the app's IndexedDB. It also reads `userPrefs.get('me')` and formats with a small inline copy of the D2 rules for compact date and time, with `Intl` and no imports, because the service worker is plain JS outside the Vite graph. When the store is missing (an older database version) or empty, it uses `system`. A unit test runs the service-worker formatter against the D2 module on a shared fixture table so the two cannot drift.

### D8. Settings panel

A `DateTimeSection` with three labelled selects ("System (14 Oct 2026)" and so on, showing what each option looks like with today's date) and a preview row: a compact date, a numeric date, a time, and a mini week strip starting on the chosen day. It writes through `mutate()` like any op. It goes into the General section's panel list for now; `settings-redesign` moves it to Preferences. It has a Help link and screen id `settings/date-time`. It is not on the demo deny list: it is a personal op with no outbound effect.

## Risks / Trade-offs

- **[Old server rejects `user_prefs` ops as an unknown entity]** → The same as every additive entity before: client and server ship in one binary. A client talking to an older server keeps the local value. The rejected op is handled like any other rejected op (the sync protocol's invalid-op path), so the setting works on that device only until the server is upgraded. The release notes say so.
- **[`getWeekInfo` missing in Firefox]** → Fall back to Monday for `system`, and offer the explicit choice. The preview makes the effective value visible.
- **[A text date field is less discoverable than a native picker on phones]** → A calendar button is always visible next to the field. `inputmode="numeric"` is set when the date format is numeric-only, and the popover renders as a bottom sheet below 640px (existing Popover behaviour).
- **[Migrating about 30 call sites causes visual churn]** → The `system` defaults reproduce today's strings. Snapshot tests for the formatter pin `system` output to match the old calls, and the guard test from D3 prevents regressions.
- **[Two formatters (app and service worker)]** → Covered by the shared fixture test in D7.

**Size:** no dependency. The formatter, parser and calendar add an estimated 4–6 KB gzipped to the web bundle. The Go binary only gains the embedded bundle growth, and memory is unchanged.

## Migration Plan

There is no data migration. Absent preferences mean `system`, which renders exactly as today. The Dexie version bump adds an empty table. Rollback means shipping the previous binary: old clients ignore the `userPrefs` table, and the server rejects new `user_prefs` ops while existing rows stay inert in the log.

## Open Questions

- Should the CLI (`ot`) and the in-app assistant's user-facing replies adopt the preference later? Both currently use fixed or ISO formats on purpose, and either can follow in a separate change without touching these specs.
