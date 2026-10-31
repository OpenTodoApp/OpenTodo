# Proposal: multi-day-tasks

## Why
Some tasks occupy several days: a conference, a trip, "write the report" over a working week, a festival shift. Today a task is drawn on one day only (its do-on date), so the calendar shows a three-day trip as a dot on its last day and the user cannot see that Tuesday to Thursday are taken. Issue #558 (split from #427) asks to draw a task with a start date and a due date as a bar across those days in Week and Month, with draggable ends. The research names the three-date model (defer, planned, due) as an OmniFocus strength that OpenTodo already has (`start`, `due`, `deadline`), and an integrated time-blocking calendar as table stakes; the missing piece is showing a range. The catch, raised in the issue: `start` already means "defer until" (`start-dates`), and many users set it on tasks that are not ranges at all ("show this from Monday, do it Friday"). Drawing every start-to-due pair as a bar would clutter their calendars and change what an existing field means.

Roadmap: milestone 0.19 "Series and time", item `multi-day-tasks`. It lands after the three series changes (`series-occurrences`, `series-exceptions`, `series-split`), which it shares the recurrence and date model with.

## What Changes
- A new additive boolean task field `span` (default false): "show this task as a span from its start date to its do-on date". It changes no meaning of `start` or `due`: a span task is still deferred before its start and started on it, as `start-dates` says. The flag only decides how calendars and Upcoming draw the task.
- A task is drawn as a span when `span` is true, its start is a date (not `someday`) and its do-on date is a later date. Any other combination draws the task as today, and the flag is kept.
- Setting it: the When popover's Start segment gets a **Multi-day** switch, offered when the task has a do-on date. Turning it on keeps a start date that is before the do-on date; without one it sets the start to the day before the do-on date, so a two-day bar shows at once, and the Start date field takes focus to pick the first day. In Week and Month a date-only task's trailing end can be dragged to a later day (or `Shift+Right` pressed) to make it a span starting on its current day.
- Week: a span is one bar in the all-day strip across the days it covers, in the task style (soft project fill, solid edge), distinct from event chips. Day: the bar's piece for that day, reading "Day 2 of 3". Month: a bar across the cells of each week row it covers, continuing on the next row. Plan: the task's row on each covered day with "Day n of m".
- Moving: dragging the bar's middle moves start and due by the same number of days in one batch; dragging either end changes start or due. Keyboard: `Left`/`Right` move the whole span by a day, `Shift+Left`/`Shift+Right` move the end, `Alt+Shift+Left`/`Alt+Shift+Right` move the first day.
- Today and Upcoming: before its first day a span task is listed in Upcoming under its first day with a range chip ("3–5 Nov"), not hidden as other deferred tasks with a later due date are; during the span Today lists it with "until 5 Nov" in place of the "Started" chip.
- Recurring spans: the start already moves with the series (`recurring-tasks`, "Start date and evening on a series"), so a span keeps its length on every occurrence. The projected occurrences of `series-occurrences` are drawn as spans of the same length.
- Capacity: a span's estimate counts on its due day only, as today.
- Integrations: REST and export carry `span`; the CLI gets `--span` / `--no-span` on `ot add` and `ot edit`; MCP task results carry `span` and the create and update tools accept it; CalDAV serves `X-OPENTODO-SPAN:TRUE` beside `X-OPENTODO-START`; the outgoing calendar feed and calendar sync write a span as an all-day multi-day event, and calendar sync reads a moved or resized event back into start and due; the vault writes `[span:: true]`.

## Capabilities

### New Capabilities
- `multi-day-tasks`: the `span` field, when a task is drawn as a span, how Day, Week, Month and Plan draw and move it, keyboard equivalents, phone layout, recurring spans, and the integrations' mapping.

### Modified Capabilities
- `start-dates`: "Deferred tasks" (a deferred span task is listed in Upcoming under its first day) and "Started tasks in Today" (a span shows "until" instead of "Started").
- `caldav-sync`: an added requirement for `X-OPENTODO-SPAN`.
- `calendar-sync`: an added requirement for writing and reading back spans as all-day multi-day events.
- `calendar-feeds`: an added requirement for spans in the outgoing task feed.
- `markdown-vault`: an added requirement for the `[span:: true]` inline field.

## Out of scope
- Spans with times (from Tuesday 14:00 to Thursday 12:00). A span is whole days; a due time on a span task is shown on its last day as "until 17:00" and the task is not drawn as a timed block.
- Creating a span by dragging across empty days, and quick-add phrases such as "3–5 Nov" or "from Monday to Wednesday": follow-ups (the first belongs with `calendar-clarity`'s "add with the mouse").
- Spreading a span's estimate over its days, or capacity per covered day.
- A filter keyword for spans.
- Changing what `start` means for tasks without the flag.

## Impact
- **Data model and op schema:** one additive field `task.span` (`kBool`, default `false`) in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. No migration: existing tasks are not spans. Not a content field (a boolean, like `evening`), so it stays plaintext on encrypted accounts and reveals nothing the plaintext `start` and `due` do not already. Older clients store and forward it untouched.
- **Sync and convergence:** ordinary per-field last-writer-wins. Moving a span writes `start` and `due` in one batch with one timestamp, so a concurrent move on another device wins or loses as a whole for each field.
- **API, CLI, MCP:** `span` on `POST`/`PATCH /api/v1/tasks` and in task representations (`400 invalid_input` for a non-boolean); no new route, so no change to the route matrix. `ot add --span`, `ot edit --span|--no-span`. Agent tools: `span` in task results and in create/update arguments.
- **CalDAV:** `X-OPENTODO-SPAN:TRUE`; DTSTART and DUE keep their meaning (due and deadline). Generic clients show the task on its due day, as today.
- **Calendar feeds and calendar sync:** a span becomes an all-day event from its start to its due (DTEND the day after), whatever the "Include tasks without a time" option says.
- **Vault:** `[span:: true]` beside `🛫` and `📅`.
- **Bundle and binary size:** no dependency. Estimated +4 KB gzipped in the web bundle (bar layout in the all-day strip and month rows, drag ends), a few hundred bytes in the Go binary.

Fixes #558
Relates to #427
