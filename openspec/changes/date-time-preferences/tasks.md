# Tasks

## 1. Synced `user_prefs` entity (design D1)

- [x] 1.1 Add `user_prefs` (`date_format`, `time_format`, `week_start`, all `kString`) to `internal/sync/ops.go` `Schema` with a comment citing this change. Add a sync test showing an op from user A lands in A's personal scope only and that concurrent writes converge by `(ts, device)`. Verify with `go test ./internal/sync/...`.
- [x] 1.2 Add a `user_prefs` op to `internal/activity/testdata/activity_fixture.json` that must produce no activity event. Verify with `go test ./internal/activity/...` and the matching `web/src/lib/activity.test.ts` (`npm test` in web/).
- [x] 1.3 Client data layer:
  - the `UserPrefs` type in `web/src/lib/types.ts`
  - defaults (`system` ×3) in `web/src/lib/ops.ts`
  - the next free Dexie version (v15 if `ui-primitives` has taken v14) with a `userPrefs: 'id'` table (redeclare every store) in `web/src/lib/db.ts`
  - entity maps in `lib/e2eeSync.ts` and `lib/assistant.ts`

  Verify with a vitest that applies a remote `user_prefs` op and reads it back, and that an offline `mutate()` queues it in the outbox (`npm test` in web/).
- [x] 1.4 Include the caller's `user_prefs` row in the JSON export (a `user_prefs` array beside the `Plural` collections in `handleExport`) and restore it when an own export is imported. Verify with an export test in `internal/httpapi` and an importer round-trip test in `internal/importer` (`go test ./...`).
- [x] 1.5 Document the entity in the `docs/sync.md` entity table and personal-scope paragraph. Verify with `npm run docs:check` in web/.

## 2. Formatting API (design D2, D3)

- [x] 2.1 Implement `DateTimePrefs` resolution in `web/src/lib/dates.ts`: `system` hour cycle, date order from `formatToParts`, week start from `Intl.Locale` week info with a Monday fallback. Verify with unit tests covering each value and an unknown value (→ `system`).
- [x] 2.2 Implement `formatDate` (compact, numeric, long, heading), `formatTime`, `formatInstant`, `weekStartOf` and `weekDays` with cached formatters. Rebase `weekday`, `formatShort`, `formatDateHeading` and `dueLabel` on them. Verify with table-driven tests for each preference combination, including the spec examples (`3 Nov`, `Feb 3, 2027`, `2026-10-14`, `3:00 PM`), and snapshot tests showing `system` output equals the previous `toLocale*` output.
- [x] 2.3 Add `DateTimePrefsProvider` (live query on `userPrefs`, React context plus module snapshot) and a `useDateTimeFormat()` hook, mounted in `App.tsx`. Verify with a component test showing a written op re-renders a date without a reload.
- [x] 2.4 Migrate every direct `toLocaleDateString`, `toLocaleString` and `toLocaleTimeString` call in `web/src/app` and user-facing `web/src/lib` code (TaskConversation, FeedView, CalendarView, `lib/history.ts`, TrashView, SecurityPanel, TokensSection, BackupsPanel, `lib/backups.ts`, ReminderToasts, UsersPanel, ImportScreen, WebhooksPanel, TwoFactorPanel, SyncStatus, TaskListView, TaskDetail, ProjectInviteScreen, AuthScreen, AssistantPanel/Settings, `lib/labels.ts`, `lib/webhooks.ts`, `lib/ops.ts` where user-facing). Verify with `npm test` and `npm run build` in web/.
- [x] 2.5 Add the guard test that fails on a new direct `toLocale*String(` outside `lib/dates.ts` and the documented allow-list (`lib/assistant.ts` `dueWords`, `lib/filter` comparison helpers). Verify it fails on a planted call and passes on the tree (`npm test`).

## 3. Date and time entry (design D4)

- [x] 3.1 Build `web/src/app/datetime/parse.ts`: ISO, numeric dates in the resolved order with roll-forward, and relative words through `lib/nlp/dates.ts`; times in 12h and 24h forms. Verify with unit tests for the spec scenarios (`3/11` day-month, `3pm` → `15:00`, `31/02` rejected).
- [x] 3.2 Build `DateField` with a calendar popover on `app/overlay` Popover: a `role=grid` month view, week start from prefs, arrows, Page Up/Down, Home/End, Enter and Escape, today and selected marked, an inline error with `aria-invalid`. Verify with a component test for keyboard picking (14 Oct → right, right, Enter → 16 Oct) and an axe check in the test.
- [x] 3.3 Build `TimeField` with a 15-minute suggestion listbox. Verify with component tests for typed `1530`, `3:30 pm` and arrow selection.
- [x] 3.4 Switch `DueField.tsx` to DateField and TimeField, keeping "Fixed to time zone", `z` and `dueFromView` semantics. Verify with the existing DueField and zoned-due tests plus a test that a typed date writes the floating `{date}`.
- [x] 3.5 Switch `RemindersField.tsx` from `datetime-local` to DateField and TimeField, with `formatInstant` for the list. Verify with tests that an absolute reminder stores the right `fire_at` instant and the list shows `Tue 3 Nov, 09:00` for day-month and 24h.
- [x] 3.6 Update the user guide pages that describe due dates and reminders (in `docs/`, regenerating the help bundle). Verify with `npm run docs:build` and `npm run docs:check` in web/.

## 4. Week start and quick add (design D5, D6)

- [x] 4.1 Make `weekDates(iso, weekStart)` in `lib/calendar.ts` and pass it from CalendarView. Format grid hour labels and block times with `formatTime`. Verify with the Sunday-start test (2026-10-14 → 10-11…10-17) and the 12h label test.
- [x] 4.2 Add `weekStart` to the quick-add resolver in `lib/nlp/dates.ts` ("next week", the "next <weekday>" window). Verify with the spec scenario "Next week with a Sunday start", with all existing nlp tests still passing.
- [x] 4.3 Extend `resolveDayMonthOrder` with the date format preference (an explicit device setting wins). Show the deciding source in `QuickAddSettings.tsx`. Verify with tests for the two spec scenarios (`3/11` → 2026-11-03 and 2027-03-11).
- [x] 4.4 Update `docs/` quick-add and calendar pages for the week-start and order rules. Verify with `npm run docs:check`.

## 5. Push notification text (design D7)

- [x] 5.1 In `web/public/push-sw.js`, read `userPrefs` `me` and format the due line with an inline formatter, falling back to `system` when the store is missing or empty. Verify with a vitest that loads the service-worker formatter and compares it with `lib/dates.ts` over a shared fixture (`Due Nov 3, 3:00 PM` for month-day and 12h).

## 6. Settings panel (design D8)

- [x] 6.1 Add `DateTimeSection` to the General section in `SettingsView.tsx`: three selects whose option labels show today's date, a live preview (compact date, numeric date, time, week strip), writes through `mutate()`, a Help link and screen id `settings/date-time`. Verify with a component test showing that switching to 12h updates the preview and an open list without a reload, and with the `settingsSections` test.
- [x] 6.2 Document the panel in the settings page of the user guide and add the help id. Verify with `npm run docs:check`.

## 7. Integration

- [x] 7.1 Manual smoke on `make dev`: set day-month, 24h and Sunday on one browser profile, check list rows, task detail due and reminders, Week view and comments, then confirm a second profile signed into the same account picks the settings up after sync. Record the result in the change folder notes.
- [x] 7.2 Run `make check` (go test, web test and build, docs check). Verify it passes.

## Workflow follow-up

- Add a ROADMAP.md row under "4. Time management": "Date, time and week-start preferences | `date-time-preferences`".
- Add a CHANGELOG.md entry under Unreleased.
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
