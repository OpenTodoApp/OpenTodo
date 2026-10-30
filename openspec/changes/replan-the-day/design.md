# Design

## D1. What counts as a missed block

A task is a missed block when it is open, not deleted, due on the logical today (`date-time-preferences` "Logical today") with a time, and its block end (due time plus its estimate, or plus the 30-minute default when unestimated, as the grid draws it) is at or before now. Left out, and never moved:
- tasks the user may not edit (a viewer of a shared project);
- tasks on a shared project assigned to another member (the plan of the day is the person's own);
- the task with the user's running time entry (it is being worked on);
- tasks of archived projects (the calendar does not show them).

Blocked tasks, subtasks and recurring tasks are included: a recurring task's due edit moves the current occurrence only, as a drag does. A block that started before now but ends after it is not missed; it is in progress.

Alternatives considered: including date-only tasks of today (they have no block that can be missed, and the "unscheduled" lane already holds them); including earlier days' timed tasks (Today's "Earlier" group has its own Move all to today; mixing the two would turn this into a re-plan of the week).

## D2. A deterministic packer

`replan(input) → {moves, unfit}` is a pure function in `web/src/lib/replan.ts`:

1. `start` = now rounded up to the next 15-minute mark of the grid; `end` = the device's grid end hour (`time-blocking` "Grid preferences", default 22:00) on the logical today. When the day start is after midnight and now is past midnight, `end` is the grid end of the logical today, which is already behind; then nothing fits.
2. Busy intervals: every open timed task block today that is not a missed block (with its drawn length), and every busy (not free) timed event of enabled subscriptions shown on this device. When the device's Calendars toggle is off, events are not obstacles, matching what the grid shows. Once `calendar-slots` exists, slot blocks are busy too. Frames (`calendar-frames`) are not obstacles.
3. Missed blocks are sorted by original due time, then priority (1 first), then task id.
4. Each in turn takes the first free interval at or after `start` that holds its whole length, starting on a 15-minute mark; that interval becomes busy. A block that finds none goes to `unfit`.

No gap between blocks, no splitting, no reordering by priority beyond ties: the plan the person made in the morning keeps its sequence, only later. The same input gives the same output on every device; the clock is an input, so tests pin it.

Alternatives considered: ordering by priority or urgency first (changes the person's own sequence without being asked); best-fit packing (fills holes with small tasks out of order, harder to read in the preview); a Go twin with shared vectors for the server (see D6).

## D3. Frames guide, they do not block

`calendar-frames` draws background windows such as "Deep work 9–11". They are intentions, not appointments, so the packer does not avoid them. A later change may prefer a matching frame when one exists; this change keeps the rule simple and says so.

## D4. Preview, Apply, one Undo

- **Entry:** the lead line of the Day and Week header (inside the header element, `data-page-lead`) gains "n blocks behind · Re-plan" while today is on screen and at least one missed block exists. The calendar overflow menu has "Re-plan the rest of the day" under the same condition. Today's overflow menu offers it too and opens the Day view of today with the preview already open. The command palette lists it as a command, enabled under the same condition. No new shortcut: the lead-line button and the menu items are keyboard reachable.
- **Preview:** Day and Week draw each move as a ghost block (the block style with a dashed accent outline) at its new place and the original block in the faint past tone with a "moves to 14:30" note on focus. A bar replaces the lead line's sentence (still inside the header, so no chrome row is added): "4 tasks move · 1 doesn't fit", a choice for unfit tasks (**Leave them** default, **Move to tomorrow**), **Apply** and **Cancel**. Enter in the bar applies; Escape cancels. While the preview is open, dragging and the placement keys are paused on the grid.
- **Live:** the proposal is recomputed when local data that feeds it changes (a sync, a completion, another device's move) or the 15-minute mark passes; if nothing is missed any more, the preview closes with "Nothing to re-plan".
- **Apply:** one `mutateMany` batch of `due` edits. A move keeps the date's zone handling of a drag: a time fixed to a zone stays fixed, the new wall time converted into that zone. "Move to tomorrow" sets the due date to the next logical day with the same time and zone. Right before writing, each task is checked again (still open, still editable, due unchanged since the preview); tasks that changed are skipped and the toast says "3 moved · 1 changed meanwhile". The toast offers Undo, which restores every previous due value of the batch in one step.
- **Deadline:** a move that puts a task after its deadline day (only possible with Move to tomorrow) shows a warning icon on its preview row: "After its deadline".

Principle: nothing moves before Apply, and one Undo takes it back (roadmap anti-roadmap "No change without approval").

## D5. Offline, conflicts, sharing, encryption

- Offline: the packer uses local tasks and the device's event cache; outside the cache's window, events are unknown and the preview's bar says "Calendars unavailable offline", packing around tasks only.
- Conflicts: after Apply, each due converges by last-writer-wins per field, as any drag. If another device moved the same task later, its time wins everywhere.
- Shared projects: only tasks the user may edit and that are unassigned or assigned to them are moved (D1). Other members see an ordinary due change in history.
- Encrypted accounts: no content is read or written; the batch is the same ops.

## D6. Client only; where it degrades

The packer runs only in the web app and the native shells (which load it). The CLI and MCP get no re-plan command in this change: a Go twin with shared vectors and a planning tool would double the size of an M change for a flow whose value is the visual preview. An agent can still read today's tasks and propose moves with the existing `schedule_tasks` write tool behind the usual gates, and the in-app assistant can propose such a change set for confirmation. The docs say so. A later change can add `internal/replan` and a `plan_rest_of_day` tool if people ask.

## D7. Interface budget and disclosure

- Chrome: the entry and the preview bar live in the header's lead line, inside the one header element; the phone sheet is an overlay. No chrome row added.
- Task properties, sidebar destinations: unchanged. Scroll regions: the phone sheet's list is the sheet's body, which replaces no region and adds none to the page while open (sheets are overlays).
- Shortcuts: none added.
- Disclosure: the entry appears only when the Calendar has missed timed blocks, which only people who time-block can have. Simple-list users never see it.

## D8. Phone

Below 640 px the Week is the agenda and the Day keeps its grid. On either, Re-plan opens a bottom sheet: one row per move, "10:00 → 14:30" in tabular figures then the title, then the unfit tasks with the Leave them / Move to tomorrow choice, then Apply (primary) and Cancel. Targets are at least 48 px. The grid shows no ghosts while the sheet is open.

Data model impact: none. Image size and memory: unchanged.
