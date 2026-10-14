# Proposal

## Why

Dates and times in OpenTodo follow whatever the browser locale happens to be, and the two date entry controls do not even agree: the due field uses separate native date and time inputs, while the reminder field uses one native `datetime-local` input whose look comes from the operating system (`web/src/app/RemindersField.tsx:193`, `web/src/app/DueField.tsx:42-44`). Someone who runs an English browser but writes dates day-first, or wants a 24-hour clock, cannot change any of it. The Week view always starts on Monday (`web/src/lib/calendar.ts:132-135`), and the quick-add numeric date order is a separate per-device setting. Commercial task apps (Todoist, TickTick) let the user choose date format, time format and first day of the week once and apply it everywhere. OpenTodo should too.

## What Changes

- **Three personal preferences:** date format (`system`, `day-month`, `month-day`, `iso`), time format (`system`, `12h`, `24h`) and first day of the week (`system`, `mon`, `sun`, `sat`). The default is `system` for each, which reproduces today's behaviour exactly.
- **Synced like other personal data:** the preferences are stored as a new personal-scope entity `user_prefs` written through the op log, following the `project_prefs` precedent. They apply on every device of the user, can be changed offline, and converge field by field with last-writer-wins.
- **One formatting module:** `web/src/lib/dates.ts` becomes the single place that turns dates and times into text. Every user-facing date and time goes through it: list and row due labels, date group headings, the due and reminder fields, reminder toasts, Day and Week views, comments and activity timestamps, history, trash, the activity feed, sessions, tokens and backups lists.
- **Date and time entry follows the preference:** the native `date`, `time` and `datetime-local` inputs in the task detail (due and reminders) are replaced by a date field and a time field. Each is a text field that displays and accepts the chosen format, accepts natural phrases ("tomorrow", "fri", "3pm"), and has a calendar popover whose weeks start on the preferred day. Due and reminders use the same controls.
- **First day of the week:** the Week view, the calendar popover and the quick-add week phrases ("next week", "next Wed") respect it.
- **Quick add:** its numeric date order ("3/4") follows the date format preference while the per-device quick-add setting is left on automatic.
- **Push notifications:** a system notification's text, which the device builds from its local copy of the task, formats the due date with the user's preference instead of raw `YYYY-MM-DD HH:MM`.
- **Settings:** a "Date and time" panel with a live preview, placed in the current General section. The `settings-redesign` change later moves it into Preferences without changing its behaviour.

Out of scope:
- Interface language and translations. Only the formatting of dates and times changes; month and weekday names still come from the browser locale.
- Relative-date wording options ("in 3 days").
- The user's time zone as a setting (the browser's zone stays authoritative), and the usability work on "Fixed to time zone", which belongs to `task-detail-redesign`.
- Server-rendered text. The server formats no user-facing dates today. The CLI (`ot`), the REST API, CalDAV, MCP and the assistant's model-facing text keep their ISO or fixed formats, which are machine contracts.
- Date inputs outside task editing (audit log filters, backup schedule time). They may adopt the new controls later.

ROADMAP: this advances section 4 "Time management" (floating due dates, reminders, the time-blocking calendar). There is no row for it yet; archiving adds "Date, time and week-start preferences | `date-time-preferences`" there.

Nothing here is **BREAKING**. The op log gains one entity, which is an additive schema change: an older server rejects unknown-entity ops as invalid, as it does for every new entity, and the client keeps the local value. No environment variable is added.

## Capabilities

### New Capabilities
- `date-time-preferences`: the user's date format, time format and first day of the week. Covers how they are stored and synced, the defaults, and the rule that every user-facing date and time, and every date or time entry control in task editing, follows them.

### Modified Capabilities
- `time-blocking`: the Week view starts on the preferred first day of the week instead of always Monday.
- `natural-language-capture`: numeric dates follow the date format preference while the quick-add order is automatic, and week phrases follow the preferred first day of the week.
- `reminders`: the reminder time is entered and shown in the user's format, and the push notification text built on the device uses it.

## Impact

- **Op schema:** a new `user_prefs` entity in `internal/sync/ops.go` `Schema` (fields `date_format`, `time_format`, `week_start`, all `kString` enumerations). It resolves to the personal scope through the default branch in `internal/sync/scope.go`. Also `web/src/lib/types.ts`, the defaults in `web/src/lib/ops.ts`, a Dexie table in `web/src/lib/db.ts` (version bump), the entity map in `web/src/lib/e2eeSync.ts`, and `docs/sync.md`. These are not user-written content, so they don't go in `e2ee.ContentFields` or `CONTENT_FIELDS`.
- **Web:**
  - `web/src/lib/dates.ts` (formatting API and week math), `web/src/lib/calendar.ts` (`weekDates`), `web/src/lib/nlp/dates.ts` and `nlp/settings.ts` (week start and numeric order inputs)
  - new date and time field components on the existing `app/overlay` Popover; `DueField.tsx`, `RemindersField.tsx`
  - every component that calls `toLocaleDateString`, `toLocaleString` or `toLocaleTimeString` directly (about 30 call sites)
  - `web/public/push-sw.js` notification text
  - a settings panel in `SettingsView.tsx`
- **Server:** schema entry only. No new route and no change to the demo deny list.
- **Docs:** the user guide page on settings and dates, `docs/sync.md` (entity table), and the help bundle.
- **Size:** no new dependency. The calendar popover and parsing are hand-written, a few KB gzipped.
