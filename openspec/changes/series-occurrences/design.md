# Design

## Context

- **The series is one row.** `recurring-tasks` stores a repeating task as one row whose `due` is the current occurrence; completing it writes an occurrence record (`occurrenceId(series, date)`) and moves the row (`web/src/lib/recurring.ts` `planCompletion`, server `internal/sync/recurring.go` `RecurringCompletion`).
- **Plan already projects.** `projectedOccurrences` in `web/src/lib/plan.ts` walks the rule from the current due with `followingOccurrence`, counting completed records so `for N times` stops the walk, with a cap of `MAX_PROJECTIONS` (31) per series. Plan draws them dimmed and read-only and counts their estimates in its capacity bar (`planner-view`). Every other view shows only the current occurrence (`recurring-tasks`, "Recurring tasks in views").
- **Day, Week and Month** render open dated tasks from Dexie (`CalendarView.tsx`, `calendar/DayColumn.tsx`, `MonthView.tsx`), each with a capacity line (`calendar/CapacityLine.tsx`). The header's overflow menu holds "Plan from a list".
- **The Go grammar** (`internal/recurrence`) has `Following` and `Preview` and the shared vectors in `web/src/lib/recurrence.vectors.json`; there is no range walk on the server.

## Goals / Non-Goals

**Goals:** future occurrences visible in Day, Week and Month (and, on request, Upcoming) with no stored data; one calculator for every view and the server; the same projections on every device.

**Non-Goals:** acting on an occurrence (`series-exceptions`); "this and following" (`series-split`); projections in Today, lists or calendar clients.

## Shared series model

The three series changes (`series-occurrences`, `series-exceptions`, `series-split`) share this model. Each design.md carries the same section so each change can be read, built and archived alone; a later change only adds the parts marked with its name. It names the model `recurring-tasks` already ships and extends it.

**M1. The series row is the task.** A recurring task is one row that holds the rule and stands on its *current occurrence*: its `due` (unchanged since `recurring-tasks`). Edits to the row are edits to the series. There is no separate "series definition" entity and no stored list of future dates.

**M2. An occurrence is a date of the series.** The *occurrence dates* of a series are the dates its rule produces from the current occurrence onward, within its end condition (`until`, `for N times`) and, after a split, within its piece (M7). An occurrence is identified by `(series id, occurrence date)`. Nothing is stored for an occurrence nobody acted on: it is drawn as a *projected occurrence*, computed on each device from the synced series row and its occurrence records, so every device draws the same ones (`series-occurrences`).

**M3. An occurrence record is the one row an occurrence can have.** When someone acts on one occurrence alone (completes it, skips it, moves it, edits it, or uses "This occurrence only"), the occurrence becomes a task row with:
- the id `occurrenceId(series id, occurrence date)`, the derivation completion records use today (`nameId("occurrence", "<series>:<date>")`), so devices acting on the same occurrence offline write the same row;
- `series_id` = the series, `recurrence` = null, the series' other fields copied as completion records copy them today;
- the additive field `occurrence_date` = the occurrence date it stands for (iCalendar `RECURRENCE-ID`), written once at creation and never changed by the app (`series-exceptions`).

A record is in one of four states: **open** (moved or edited, still to do: `completed_at` null), **done** (`completed_at` set), **skipped** (`completed_at` set and `skipped` true, as habits already write) or **trashed** (`deleted_at` set; only an older client or the Trash writes it, the app removes an occurrence by skipping it). A record written before `series-exceptions` has no `occurrence_date`; its occurrence date reads as its `due.date`, which is how `completedOccurrences` recognises it today. A "This occurrence only" copy made before `series-exceptions` (id `detachedId`) stays a standalone task and is not a record.

**M4. Exceptions are derived from the records, never stored on the series.** The *exception dates* of a series are the occurrence dates of its records, in any state. A projection is never drawn on an exception date, and the series never stands on one: moving the series to its next occurrence (completion, skip, "This occurrence only") goes to the first occurrence date after the current one that is not an exception. This is iCalendar's EXDATE, kept where it converges: two devices that each act on a different date offline each write their own record, and both exceptions survive the sync. A list field on the series (an `exdates` register) would lose one of them under last-writer-wins.

**M5. Repair when a device rolled before it saw a record.** A device that moved the series before it received another device's record can leave the series standing on an exception date. Any device that may edit the task and finds the series on an exception date writes the series' `due` (and the `deadline` and `start` that move with it) to the next non-exception occurrence date. The value is a pure function of the synced rows, so every device that repairs writes the same value and they converge; the server's completion path (REST, CalDAV, assistant) applies the same rule before it writes.

**M6. Counting.** `for N times` keeps the meaning `recurring-tasks` gave it: done records count, skipped records do not, so a skip extends the series by one. An open record is an occurrence still to come, so it uses up one of the remaining N while it is open. The series' remaining budget is `N − done records − open records`; the current occurrence and the projections together never exceed it. `until` bounds every date, records included.

**M7. A split makes pieces of one lineage (`series-split`).** "This and following" from an occurrence after the current one ends the series the day before (`until`) and starts a new series row, the *piece*, on that date, with the id `nameId("series-split", "<series>:<date>")` and the additive field `split_from` = `{series, date}`. The pieces of one lineage are the root series and every piece whose `split_from` leads back to it. Each piece produces occurrence dates from its own `split_from.date` until the day before the next piece's `split_from.date` (pieces ordered by that date), whatever its own `until` says; records of earlier pieces dated on or after a piece's first date are exceptions of that piece too. Habit history and the `for N times` count are taken over the lineage.

**M8. Who sees what.** Projections are read from local rows and work offline. A viewer of a shared project sees projections and records but cannot act on them. On an encrypted account the device copies and encrypts content into a record itself (a ciphertext is bound to its entity id, so it cannot be copied as is); the server, which cannot read the series' title, writes the records it creates without content fields, and every client shows a record's missing title and notes from its series until an unlocked device fills them in.

**M9. Outside the app.** CalDAV serves the series as one VTODO (DTSTART/DUE = current occurrence, RRULE), every exception date from the current occurrence on as `EXDATE`, and open records as their own VTODOs; a `RECURRENCE-ID` override or an `EXDATE` a client sends becomes the matching record (`series-exceptions`). The Markdown vault writes the series line at its current occurrence as today and each open record as an ordinary task line; done and skipped records stay out of the files. Calendar sync to a user's own calendar keeps writing the next occurrence only.

## Decisions

### D1. Projections stay derived and unwritten

A projection is a value computed from the series row, its records and today; it is never an op, a Dexie row or a cache entry. Two devices with the same rows draw the same projections, and nothing needs to converge.

- **Alternative: materialise future occurrences as rows** (a horizon of N weeks written ahead). Rejected: thousands of rows for daily series, every rule edit rewrites them, two devices writing the horizon concurrently need deduplication, and #537 itself asks for occurrences "calculated logically for the visible date range rather than creating an unlimited number of task rows".
- **Alternative: a server-side expansion endpoint the views call.** Rejected: views must work offline from local rows.

### D2. One module, `web/src/lib/occurrences.ts`, with a Go port

`occurrencesInRange(series, records, today, from, to, zone)` returns the projections in `[from, to]` (viewer's days). It moves the walk out of `plan.ts` unchanged: calendar rules as if each occurrence were completed on time, completion-relative rules as if each were completed on its day, `done` from the completed records, the cap per series. `projectedOccurrences` in `plan.ts` becomes a call to it. The cap stays 31 per series per range; Month's 42-day range of a daily series therefore draws 31, the walk reports `capped: true`, and the view says so in the series' tooltip ("Showing the next 31 occurrences"). The function already takes the records so `series-exceptions` can remove exception dates (M4) without a new parameter.

The Go port `recurrence.Occurrences(rule, due, today string, done int, from, to string) []string` returns floating dates only (the route answers in floating dates, D7). A new vector file `web/src/lib/occurrences.vectors.json` pins both: weekly, a weekday list, `every month` from the 31st, `for N times` with done records, `until`, a catch-up series, a completion-relative rule, a range before the current due, and the cap.

- **Alternative: keep the walk in `plan.ts` and import it from the calendar.** Rejected: Plan is one consumer of five, and the server needs the same walk.

### D3. Where projections are drawn, and how they look

- **Day and Week:** a timed projection is a block at its time, sized by the series' estimate (or the 30-minute default), in the *projected* style: the series' project hue at the faint fill, a dashed 3 px leading edge, the repeat icon before the title, and the accessible name "<title>, repeating, projected, Wednesday 14 October 18:00". A date-only projection is a chip in the day's unscheduled lane in the same style. Projections take part in the side-by-side overlap layout like event blocks, so they never cover a task.
- **Month:** a projection is a row in its day cell in the same style, ordered with the day's tasks by time, priority and position (as Plan's `columnEntries`), and counted in "+N more".
- **Phone layouts:** Week's vertical agenda and Month's day list below the grid show projections as dimmed rows with the repeat icon. Month's per-day count on the grid counts tasks only, so the number keeps meaning "things to do there now"; the day list shows the projections under the tasks.
- **Past days:** projections start after the current occurrence (after today for a catch-up series), so none is drawn in the past.

The dashed edge tells a projection from a past (dimmed) block without relying on colour; it is a variant of the filled-block tokens in `web/src/index.css`, not a new colour.

### D4. One switch per surface, per device

- Calendar header overflow menu: **Show repeating occurrences**, a checked menu item, on by default, stored in device storage (`calendar.projections`), for Day, Week and Month. Plan always draws them, because its capacity includes them (`planner-view`); the item is not shown there.
- Upcoming header overflow menu: **Show repeating occurrences**, off by default (`upcoming.projections`). When on, Upcoming lists the projections of the next 14 days as dimmed rows under their day headings, after the day's tasks; today is excluded, since today's occurrence is the series row itself. 14 days keeps a daily series to 14 rows; the last day with a projection carries the note "Repeating tasks shown up to <date>".

Per device, not synced, like Plan's span: it is a way of looking, and a phone and a desktop may want different answers. Simple-list users see nothing new: Today, projects and saved views are unchanged, Upcoming's default is off, and the calendar is not a Simple-list surface.

- **Alternative: a synced preference.** Rejected for the reason Plan's span is per device.
- **Alternative: projections in Upcoming by default.** Rejected: the issue warns that daily tasks would flood it.

### D5. Capacity counts projections where they are drawn

The planned total of a Day or Week column and a Month cell adds the estimates of the projections it draws, and the tooltip names them ("2h 50m of tasks · 45m repeating"), as Plan's bar does. With the switch off, they are neither drawn nor counted. A projection without an estimate counts as zero and joins the "without estimate" count. `meeting-aware-capacity` (0.18) adds busy events to the same total; the two compose by addition.

### D6. Opening a projection

A projection is not a task, so in this change it has no selection, drag, completion or context menu. It is focusable (Tab reaches it in the grid's reading order; `j` and `k` skip it, as in Plan), and click, tap or Enter opens the series in the detail panel with a line under the title: "Projected for Wednesday 14 October · next due Monday 12 October". `series-exceptions` turns this into the occurrence panel.

### D7. Read access for integrations

- `GET /api/v1/tasks/{id}/occurrences?from=YYYY-MM-DD&to=YYYY-MM-DD` (policy `signedIn`; every token scope that can read; not demo-denied, it only reads) returns `{"series_id", "rule", "occurrences": [{"date", "time"?, "tz"?, "state"}]}` where `state` is `current` for the series' due and `projected` for the others (`series-exceptions` adds the record states). The range is inclusive and at most 366 days; `from` defaults to today and `to` to `from` + 30 days. Errors: `400 invalid_input` for a bad date, a reversed range or more than 366 days; `400 not_recurring` for a task without a rule, or a completed or deleted one; `404 not_found` for a task the caller cannot see; `401` without a session or token. The answer holds no content, so encrypted accounts need nothing.
- `ot task occurrences <id> [--from] [--to] [--json]` prints the list as a table (date, time, state).
- The agent tools' task output (`internal/agenttools`) gains `next_occurrences`: the next three projected dates of a recurring task, from the same Go function. No new tool.

### D8. Interface budget and keyboard

No chrome above any list: the switches are items in existing overflow menus. No task property is added to rows. No new scroll region. No new shortcut: projections are reached with Tab and opened with Enter; `j` and `k` keep skipping them. Projections follow the reduced-motion and high-contrast presentation of blocks; in high contrast the dashed edge is the marker and meets 3:1.

## Risks / Trade-offs

- **Clutter on dense weeks.** Several daily series fill a Week. Mitigation: the one-click switch, and the faint dashed style keeps tasks dominant.
- **Performance.** Projections are computed per render of the shown range. With the per-series cap and a range of at most 42 days, 200 series cost under 10,000 date steps; a vitest perf guard keeps it under 20 ms on CI.
- **Catch-up series look empty in the past.** By design: missed occurrences of a non-habit are not generated (`recurring-tasks`, "Catch up after being overdue"). Habits show missed days in their history.
- **Shared projects.** Every member who sees a shared series sees its projections; in this change they are read-only for everyone.

## Migration Plan

None: no data changes. The two switches start at their defaults on each device.

## Open Questions

- Should the calendar switch default to off for an account with many daily series? Proposed: no; revisit with feedback.
