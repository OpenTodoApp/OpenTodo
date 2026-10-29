# Proposal

## Why

People who plan by horizon rather than by date have no honest place for "sometime this week". Carl Pullein's Time Sector System, which the research cites (§2.5, Phase 4 item 1), sorts tasks into This Week, Next Week, This Month, Next Month and Long-Term. Only real appointments and deadlines get a calendar date. Its practitioners' complaint about list apps is that the only way to say "this week" is a fake due date, which turns red on Tuesday and rolls over every night. OpenTodo gets close: Someday parks a task, a start date defers it, and the calendar's planning list can plan from a label called "week" (`time-blocking` "Planning list and phone agenda"). But a label carries no period: it never knows that week 44 ended, and it can't move a task from Next week to This week when Monday comes.

The research's first opportunity area, executing the day, needs this too. Newport's multi-scale cascade (§2.1) plans the week from the quarter and the day from the week. The week needs a list that isn't a set of fake dates. `plan-objectives` adds the quarter and week cards; this change adds the tasks that sit in those periods.

## What Changes

- **A time sector on a task.** A new additive task field `sector` holds a period:
  - an ISO week `2026-W44`;
  - a month `2026-11`;
  - a quarter `2026-Q4`;
  - or null (the default).

  It's a plaintext scheduling field, synced and converging per field by last-writer-wins like `start`. A task with a sector and no do-on date is scheduled: it leaves the Inbox and Anytime, is never overdue and never turns red.
- **Relative names, absolute storage.** The app shows a sector relative to the viewer's local date: This week, Next week, This month, Next month, This quarter, Next quarter, or the period's own name ("Week 47", "January", "Q2 2027"). The stored value never changes when the period comes round. A sector whose period has ended is **carried over**: it's listed under This week with a quiet "From week 43" chip, never as overdue, and nothing is written. One rules module (TypeScript, with a Go twin pinned by shared vectors) decides validity, relative names, the week a viewer's "This week" means, and carry-over.
- **Setting a sector.**
  - The When popover gains a **Sector** segment next to Do on and Start: This week, Next week, This month, Next month, This quarter, Next quarter, and a picker for a later period.
  - Choosing a sector clears the do-on date and the start in the same batch. Choosing a do-on date or a start clears the sector.
  - A deadline is kept, because a true deadline is exactly what the system keeps on the calendar.
  - The command palette gains "Set time sector" for the selected tasks.
- **Plan from sectors.** The calendar's planning list (`time-blocking`) gains a **Time sectors** source. It groups open tasks under Carried over, This week, Next week, This month, Next month, This quarter, Next quarter and Later. Rows are placed on a day with the existing `s` placement or by drag, which sets the due date and clears the sector as one undoable change.
- **Only available tasks.** A sector group lists only tasks that can be worked on now. Waiting tasks are counted, not listed. "Available" is the shared rule that the sibling 0.17 changes `project-flow-modes` (only the first open task of a Sequential project or section is available) and `today-closed-list` (the Today limit and its "Waiting for a slot" drawer) define in the same PR series. A task moved from a sector into Today respects the Today limit when `today-closed-list` is on.
- **Weekly review.** When sectors are on, the review's Look ahead step lists carried-over tasks and Next week's tasks with row actions: keep in This week, Next week, This month, or give a date. The existing `n` still parks a task in Someday.
- **Capture and query.**
  - Quick add recognises `this week`, `this month`, `this quarter`, `next quarter`, and every `sometime …` form (`sometime next week`, `sometime next month`…) in the six bundled languages, only while sectors are on.
  - `next week` and `next month` keep their existing date meaning.
  - The filter grammar gains `sector`, `no sector`, `sector: this week` (and the other relative words), `sector: 2026-W44` and `carried`.
- **Everywhere.**
  - REST writes and reads `sector` on tasks.
  - The CLI has `--sector` on `ot add`, `ot edit` and `ot list`.
  - The MCP tools accept and return `sector`.
  - CalDAV carries `X-OPENTODO-SECTOR`.
  - The Markdown vault writes `[sector:: 2026-W44]`.
- **Progressive disclosure.** Off by default, per user. A new **Time sectors** switch in Settings → Account → How you work (user preference `time_sectors`). With it off, Simple-list users see nothing new. A task that carries a sector written by another client still shows its chip and a Clear action, so no data is hidden.

No new environment variable, no new dependency, no new route. Not **BREAKING**: the op schema gains one task field and one user preference field.

## Out of scope

- **Long-term / On hold** as a sector. Someday already parks a task, and `project-review-cadence` adds paused projects.
- **Sectors on projects or sections.** A project can't be "this month"; its tasks can.
- **Day-level sectors** (Today, Tomorrow): that's the do-on date.
- **Automatic rollover writes.** Carry-over is derived on each device, never written. Nothing is moved by itself; that follows the anti-roadmap's "no change without approval".
- **Capacity for sectors.** The Plan's capacity bar counts dated work only. A sector's estimate total is shown as a group sum, not in a day's bar.
- **Recurring sectors** ("every week, sometime"). A repeating task keeps a date; the Sector segment is disabled for it.
- **Automation rule conditions and actions on `sector`**, and TaskNotes mapping. A note keeps any `sector` key as unknown text.
- **Year view rendering** (#557, `year-view`).

## Roadmap

Advances 0.21 "Horizons and home", item `time-sectors` in the 1.0 roadmap (research Phase 4 item 1, gap analysis P4.1). It shares the available-task rule with `project-flow-modes` and `today-closed-list` (0.17) and should land after them. `plan-objectives` reuses its period format and validator. Relates to #557.

## Capabilities

### New Capabilities

- `time-sectors`: the `sector` field and its validation, relative names and carry-over, the When popover segment, the planning list's Time sectors source and its availability rule, list chips, the How you work switch, and the shared vectors.

### Modified Capabilities

- `project-organization`: "Inbox is the default container". A sector makes a task scheduled.
- `start-dates`: "Anytime view". Tasks with a sector are not Anytime tasks.
- `weekly-review`: carried-over and next-week sector tasks in Look ahead (added requirement).
- `filter-queries`: sector terms (added requirement).
- `natural-language-capture`: sector phrases (added requirement).
- `caldav-sync`: `X-OPENTODO-SECTOR` (added requirement).
- `markdown-vault`: the `[sector:: …]` inline field (added requirement).
- `mcp-server`: `sector` in write tools, results and the `list_tasks` filter (added requirement).
- `cli-client`: `--sector` flags and output (added requirement).

## Impact

- **Data model and sync:**
  - task field `sector` (kString, default `""`, validated);
  - user_prefs field `time_sectors` (kString, default `""`, `"on"` = on).
  
  Both go in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. No migration beyond the materialized column the schema adds. Older clients store and forward the field untouched.
- **E2EE:** `sector` is a scheduling field and stays plaintext, like `due` and `start`. It's not user-written text, so it doesn't go into the content fields.
- **Shared logic:**
  - a new `web/src/lib/sectors.ts` with its Go twin `internal/sector`;
  - vectors in `web/src/lib/sectors.vectors.json`;
  - updates to `internal/inbox`, `internal/filter`, `internal/quickadd`, and their TS counterparts and vectors.
- **API/CLI/MCP:** the task field on existing routes; CLI flags; MCP tool arguments and results; the `ot schema` task schema in output version 1.
- **CalDAV and vault:** one X-property and one inline field.
- **Size:** about 4 KB gzip of client code (rules module, segment, planning source), lazy with the Calendar where possible. No new dependency, and the binary grows by the small Go package.
