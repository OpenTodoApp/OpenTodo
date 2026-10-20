# Proposal

## Why

For a person who works past midnight, the app changes its mind at 00:00: Today empties into Overdue, a task finished at 01:30 is counted for a day that has not started for them, a habit done "tonight" lands on tomorrow's square, the Daily check is suddenly due again and the Loop home asks for a new focus. Every one of these screens computes "today" from the device clock's calendar date, with no way to say when a day ends for *this* person. A single personal preference, "my day starts at", fixes all of them at once, because every date-dependent screen already reads one `today` value from one place.

## What Changes

- A fourth date and time preference, **My day starts at**, a time between `00:00` and `06:00` in whole hours (default `00:00`, which is today's behaviour), set in Settings → General → Date and time next to the first day of the week. It is an additive `day_start` field on the synced personal `user_prefs` row, so it is written through the op log, works offline, reaches the user's other devices and converges per field by last-writer-wins like the three existing preferences; unknown or malformed values read as `00:00`.
- The web app gets one definition of the **logical today**: the device's local calendar date, moved one day back while the local time is before the day-start time. Everything that asks "which day is it" uses it: the Today view and its Overdue group, the Upcoming boundary, the Anytime and deferred rules, the Completed logbook's day headings, Statistics periods and the day a completion counts for, the Loop pulse, habit streaks (pending, at risk, month grid), the Daily check's due state and Today's focus date, the sidebar counts and markers, the Day, Week and Month "today" marker, the Display mode's day, filter words (`today`, `overdue`, `this week`), quick-add relative words and the dates list actions write (`t`, `tomorrow`, "every 3 days after completion" counted from the day the person is living in). The rollover already watched every minute moves from midnight to the day-start time.
- Due dates stay floating calendar dates and no stored value changes meaning: the preference only decides which calendar day is "today" on the device showing it. Nothing new is written when the preference is applied, so devices with different clocks or different interpretations converge exactly as before.
- The weekly email digest, which already reads the user's `week_start` from the same row, also reads `day_start`, so its numbers keep matching the Statistics screen for a night owl. Other server-side features are unaffected and the decision is recorded in design.md: push reminders fire at instants, the server's own completion path (REST, CalDAV, MCP) keys an occurrence record by the occurrence's due date and never by the clock, and habit records carry no day of their own.
- No new dependency, route, shortcut, icon, token or environment variable.

Out of scope: per-project or per-view day boundaries; time zones (zoned dues keep `absolute-datetimes`); CalDAV and the calendar feeds (they carry calendar dates and instants, never "today"); the CLI, the MCP tools and the assistant tools (they take a time zone and the caller's calendar date; a `day_start`-aware `today` there is a separate, small change); a day start after `06:00` or before midnight (an evening person's day ends before midnight, which is already the default).

Advances ROADMAP.md: `date-time-preferences` (row "Date, time and week-start preferences" under "4. Time management", which this extends with the day boundary) and `stats-and-review` / `habits` (statistics and streaks that count the day the person was living in).

No new environment variable. The op log format gains one additive field; nothing is renamed or removed. Not **BREAKING**.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `date-time-preferences`: "Date and time preferences" gains the fourth preference and its default and validation; "Preferences in Settings" gains its control and preview; a new requirement "Logical today" defines the day the preference produces and lists what follows it.
- `web-app`: "Standard views" (Today, Upcoming and Completed follow the logical today), "Completed logbook" (grouped by the logical day of completion) and "Date-dependent views follow the clock" (the rollover happens at the day-start time, not midnight).
- `statistics`: "Periods and week start" (days are the user's logical days) and "What is counted" (a completion counts for its logical day).
- `habits`: "Streak derived from the schedule and the records" (the current occurrence, "at risk" and the month grid's today use the logical today; records are unchanged).
- `weekly-review`: "Daily check" (today's focus and "done for today" use the logical today) and "Rhythm markers" (the Daily check is due when not done on the logical day; the toast once per logical day).
- `email-digest`: "Digest numbers match the statistics" (the server applies the user's day start when it counts completions, so the digest and the screen agree).

## Impact

- Server: `internal/sync/ops.go` (`Schema`: `user_prefs.day_start`, `kString`), a sync test and a line in `docs/sync.md`; `internal/digest/stats.go` and `service.go` (read `day_start` with `week_start`, apply it in `dayOf` and to `Today`); the shared fixture `internal/digest/testdata/stats_fixture.json` gains a `dayStart` and cases evaluated by both `internal/digest/stats_test.go` and `web/src/lib/stats.test.ts`. No new route.
- Web data layer: `web/src/lib/types.ts` (`UserPrefs.day_start`), `web/src/lib/ops.ts` (default `''`), `web/src/lib/userPrefs.ts` (`DayStartPref`, `readDayStart`, `setUserPref('day_start', …)`), `web/src/lib/dates.ts` (`logicalDay(ms, dayStart)` and `logicalToday()` beside `todayISO`, which keeps its calendar meaning), `web/src/app/DateTimePrefsProvider.tsx` (publishes the day start the way it publishes the resolved formats), `web/src/app/useViews.ts` (`useToday()` returns the logical today and re-reads at the boundary).
- Web screens and libraries that currently take the device day: `lib/stats.ts` (the default `dayOf`), `lib/method/pulse.ts`, `lib/logbook.ts`, `lib/dayLists.ts`, `lib/review.ts` (`dailyDue`, `reviewAgo`), `lib/habits.ts` (through `today`), `lib/views.ts` and `lib/filter/evaluate.ts` (through `ctx.today`), `lib/ops.ts` and `lib/bulk.ts` (the `today` default of the recurrence and due-pick helpers), `app/TaskRow.tsx`, `app/TriageView.tsx`, `app/QuickAdd.tsx`, `app/QuickAddSheet.tsx`, `app/vim/VimLayer.tsx`, `app/display/Clock.tsx` and `DisplayScreen.tsx`, `app/datetime/DateField.tsx`, `app/task-detail/Properties.tsx`. The Settings panel `app/DateTimeSettings.tsx` gains the select and a preview line.
- Docs: `docs/settings-app.md` (Date and time), `docs/dates-and-times.md`, `docs/statistics.md`, `docs/recurrence.md` (habits), `docs/method/rhythms.md` (the Daily check), `docs/notifications.md` (the digest), `docs/sync.md`; six catalogs under `web/src/locales/` for the new strings.
- Size: no dependency. Web bundle about +0.6 KB gzipped (the helper, the select with seven options, the preview line, the catalog strings); the Go binary grows by well under 1 KB; container image and runtime memory unchanged.
- No API change for REST clients: `user_prefs` has no REST collection; the JSON export already carries the whole row, so the new field is exported and restored by the existing import path.
