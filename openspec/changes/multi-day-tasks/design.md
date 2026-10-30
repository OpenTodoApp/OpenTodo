# Design: multi-day-tasks

## Context
A task has three dates (`start-dates`, `deadlines`): `start` (null, a date, or `someday`) defers it until that day, `due` is the do-on date (with an optional time and zone) and `deadline` is the hard limit. Day and Week (`time-blocking`) draw a timed task as a block and a date-only task in the day's unscheduled lane; subscribed calendar events that cover several days are already drawn as chips in an all-day strip above the lane (`calendar-feeds`). Month (`month-view`) lists a task in the cell of its do-on date. Plan (`planner-view`) lists it in its do-on column. Nothing draws a range.

A recurring series moves its start by the same number of days as its due when it rolls (`recurring-tasks`, "Start date and evening on a series"). The series changes of this milestone (`series-occurrences`, `series-exceptions`, `series-split`) keep the series row as the task, draw future occurrences as derived, unwritten projections in Day, Week, Month and Plan, and materialise a single occurrence as an occurrence record. This change lands after them.

CalDAV already uses DTSTART and DUE for the do-on date and the deadline (`caldav-sync`, "Deadline mapping") and serves `start` as `X-OPENTODO-START`.

## Goals / Non-Goals

**Goals:**
- Show a task that occupies several days as a bar across them, and move it or change its length by pointer and keyboard.
- Keep the meaning of `start` for every existing task: nothing a user has today starts drawing as a bar.
- Behave the same offline, on encrypted accounts, in shared projects and through every integration, or say where it degrades.

**Non-Goals:**
- Timed spans, estimates spread over days, creation by dragging over empty days, quick-add range phrases (see proposal, Out of scope).

## Decisions

### D1. An additive `span` flag; the range is `start`..`due`
A span is a task with `span: true`, a date `start` and a later `due.date`. The first day is `start`, the last day is `due.date`.

Alternatives considered:
- **Draw every task with a start date before its due as a range.** Zero new fields, but it changes how existing tasks look: users who defer a Friday task until Monday would see a five-day bar. The issue explicitly rules this out.
- **A per-view display option "Draw start to due as spans".** No field, but it cannot tell a trip from a deferred chore in the same view; turning it on clutters, leaving it off hides real spans. It also does not reach CalDAV, feeds or the vault.
- **A separate `span_start` (or `end`) date field.** Explicit, but it introduces a fourth date that overlaps `start`: a span task is in fact not relevant before its first day and is active during it, which is exactly what `start` already means. Two fields that must agree would need a repair rule and would confuse the When popover.
- **A span length in days on the task (`span_days`).** Makes the first day derived from the due date; avoids two writes on a move but duplicates `start` again and fights the existing series shift of `start`.

The flag keeps `start` and `due` the single source of the range, so moving, recurrence, deferral, Today and every existing integration keep working; the flag only changes drawing. It is a `kBool` like `evening`, plaintext on encrypted accounts.

Validity is decided at display time, never refused on write: when the flag is set but `start` is null, `someday` or not before `due.date`, or `due` is null, the task draws as it does today and keeps the flag (so a later edit that makes it valid again draws it as a span). This avoids a cross-field check in the resolver, which would have to reject writes that arrive in either order from two devices.

### D2. Where the setting lives (progressive disclosure)
The switch **Multi-day** sits in the When popover's Start segment, under the start date field, offered only when the task has a do-on date. Turning it on keeps a start date before the do-on date; otherwise it writes `start` = the day before `due.date` in the same batch as `span: true`, so a two-day bar appears at once, and focuses the start date field. Turning it off writes only `span: false`; the start stays (the task is then simply deferred, as before). The When line reads "3–5 Nov" for a span instead of "5 Nov from 3 Nov".

In Week and Month the trailing end of a date-only task in the all-day strip or a Month cell can be dragged to a later day, and `Shift+Right` does the same: the task becomes a span from its current do-on date (written as `start`) to the new day (`due.date`), with `span: true`, in one batch. A task that already had an earlier start keeps nothing of it: the start becomes its current do-on date, because the user is extending from the day they see.

Simple-list users see nothing new: the switch is inside the When popover's Start segment, which a Simple-list user only opens on purpose, and no list row changes unless a task is a span. No new sidebar destination, no new setting page.

### D3. Drawing
- **Week:** a span is one bar in the all-day strip, laid out across its covered days with the same lane packing as multi-day event chips (`calendar-feeds`), above them. It uses the task style (soft fill of the project hue, 3 px solid edge on its leading side, strong text), so it is told apart from event chips (sunken fill, hatched edge) by shape and texture. A span that begins before or ends after the shown week shows a squared-off end and a chevron on that side. Spans count toward the strip's three-row cap; the "+N" control expands as today.
- **Day:** the span's piece for that day in the all-day strip, labelled "Day 2 of 3"; a due time is shown on the last day as "until 17:00". A span task is never drawn as a timed block on the grid, even with a due time: one task, one shape.
- **Month:** each week row draws the span as a bar across the cells it covers, above the cell's other rows; the bar continues on the next row with a squared-off start. Bars count toward the cell's visible rows and its "+N more".
- **Plan:** a column has no strip; the task is listed in each covered day's column with "Day n of m", read-only on the days other than its due day for the drag (dragging any of its rows moves the whole span by the column distance).
- **Past days:** the part of a bar over days before today is dimmed like past blocks (`time-blocking`).
- **Capacity:** the estimate counts on the due day only, unchanged. Spreading it would invent a distribution the user did not set.

### D4. Moving and resizing
Drag the middle: start and due move by the same number of days, one batch, one Undo. Drag the leading end: `start` changes, refusing to pass the last day (the bar stops at one day). Drag the trailing end: `due.date` changes (time and zone kept), refusing to pass the first day. Keyboard with a span selected in Week or Month: `Left`/`Right` move the span by one day (`Up`/`Down` by a week in Month, as for any task); `Shift+Left`/`Shift+Right` move the last day; `Alt+Shift+Left`/`Alt+Shift+Right` move the first day. These mirror Day/Week's vertical scheme (`Shift` = end, `Alt+Shift` = start) on the horizontal axis and are registered in the shortcut registry, scoped to the calendar views, with no conflict (`Shift`+horizontal arrows are unused there today). A span shrunk to one day keeps `span: true` and draws as one day.

Viewers of a shared project see bars without drag ends or handles and the keys do nothing, as for every other calendar move.

### D5. Today and Upcoming
The rules of `start-dates` stay; two presentations change:
- Before the first day, a span task is deferred (absent from Today and the counts) but Upcoming lists it once, under its first day, with a range chip "3–5 Nov". Other deferred tasks with a later due stay out of Upcoming, as today. Rationale: a trip starting Tuesday is exactly what the user looks for in Upcoming on Tuesday; a deferred chore is not.
- From the first day to the due day, Today lists it (it is started) with the chip "until 5 Nov" in place of "Started 3 Nov". On the due day it is due today as any task; after, it is overdue as any task.
Both are computed on the device from local data; nothing is written when the day changes.

### D6. Recurring spans
Because the start moves with the series by the same number of days as the due, a recurring span keeps its length on every occurrence; the completed occurrence record keeps the span it had (it copies `start` and, with this change, `span`). Projections (`series-occurrences`) of a span series are drawn as spans: the projected first day is the projected due date minus the series' current distance from `start` to `due.date`. Projections stay unwritten until someone acts on one; materialising one (`series-exceptions`) copies `span`, `start` and `due` shifted to that occurrence. Overlapping occurrences (a three-day span on `every day`) are drawn as stacked bars; nothing merges them. `occurrence-record` and detached-copy code in `web/src/lib/recurring.ts` and `internal/sync/recurring.go` add `span` to the fields a copy inherits.

### D7. Integrations
- **REST/export/sync:** `span` is a plain boolean field; the resolver rejects non-booleans.
- **CLI:** `--span` / `--no-span` on `ot add` and `ot edit`, with `--start` and `--due` (help text says a span needs both); `ot show` prints "3–5 Nov".
- **MCP / agent tools:** results carry `span: true` when set; create/update accept `span`. Server-side views (inbox, today) do not change, since a span changes no membership on the server.
- **CalDAV:** `X-OPENTODO-SPAN:TRUE` when set, beside `X-OPENTODO-START`; inbound sets or clears the flag; an invalid value is kept in `ical_extra`. DTSTART and DUE keep the deadline mapping; repurposing DTSTART as the span start would break every existing round trip (a client echoing DTSTART would move the do-on date). Generic clients therefore show a span on its due day, as they show it today; documented as a degradation.
- **Calendar feed and calendar sync:** a span is written as an all-day event with `DTSTART;VALUE=DATE` = start and `DTEND;VALUE=DATE` = the day after due, regardless of "Include tasks without a time" (a span is calendar-shaped by intent). Calendar sync reads a changed all-day event of a span back: first day → `start`, last day → `due.date` (time and zone kept), as ops through `ApplyStrict` with device `calsync:<connection-id>`. An event changed to a timed event writes the due as today and leaves `start` and `span` alone.
- **Vault:** `[span:: true]` as an inline field after `[evening:: true]`; read in any order; the range itself is the existing `🛫` and `📅`.

### D8. Phone layout
Below 640 px Week is a vertical agenda and Month shows counts (`time-blocking`, `month-view`). A span is listed under each day it covers in the Week agenda with "Day n of m", and counts on each covered day in the Month counts; the focused day's list under the Month grid shows it with its range chip. Drag ends are not offered on touch below 640 px; the When popover (a sheet) is the way to change the range, and a long press opens the row menu as for any row.

### D9. Interface budget
No new chrome row: bars live in the existing all-day strip and Month cells. A span row in a list shows its range chip in place of the date chip, so the visible property count is unchanged (at most seven). No new sidebar destination, no new scroll region. Three new shortcuts, all scoped to calendar views and registered without conflicts.

## Risks / Trade-offs
- [A user turns on Multi-day on a task deferred for a different reason] → turning it off only clears the flag; the deferral stays as it was.
- [Two devices: A makes a task a span, B moves its due offline] → per-field LWW keeps A's `span` and `start` and B's `due`; if B's due is before A's start the task draws as a single day until fixed (D1), never an error.
- [Long spans (a whole quarter) flood the strip] → they take one strip row; the "+N" cap applies; nothing new.
- [CalDAV clients cannot show the range] → documented; the deadline mapping keeps working; `caldav-verified` (1.0) can check a client that reads `X-` properties.
- [Spans overlap the series changes' projections] → series changes land first; this change adds only the span drawing of projections (D6).

## Migration Plan
Additive field, default false: no migration, no backfill. Rollback: a client without the change ignores `span` and draws the task as before.
