# Design

## D0. Builds on `calendar-frames`

This change assumes `calendar-frames` is applied: the `kClock` kind, the personal-entity pattern (scope, migration, store, REST/CLI/MCP shape, `e2ee.Display` in tools), the grid's layer order (bands, then blocks and slots, then the now line) and the frame popover. Implementing slots first would duplicate all of that, so `tasks.md` starts by checking the dependency.

## D1. A personal entity that holds task ids

| Field | Kind | Default | Meaning |
|---|---|---|---|
| `title` | `kString`, **Content** | `""` | "Admin"; empty reads as "Slot"; at most 200 characters |
| `date` | `kDate` | `null` | the day (floating) |
| `start` | `kClock` | `"09:00"` | wall time `HH:MM` |
| `minutes` | `kPositiveInt` | `30` | length, 15 to 480 in 15-minute steps (client check; server checks the kind and at most 1440) |
| `task_ids` | `kIDList` | `[]` | ordered task ids, at most 20, one whole-list LWW value like `blocked_by` |
| `color` | `kString` | `"#64748b"` | hex, drawn through the palette's nearest hue |
| `created_at` | `kNumber` | `0` | Unix ms |
| `deleted_at` | `kNullableNumber` | `null` | tombstone |

Slots resolve to the author's personal scope, like `frame`.

Alternatives considered:
- A `slot_id` field on the task (the research's "frame_id on tasks"). Rejected: on a shared project the field would reach every member, who would hold an id of an entity they never receive, and two members could slot the same task differently with one LWW value. Keeping membership on the personal slot leaves shared tasks unchanged for others.
- A slot as a parent task with the small tasks as subtasks. Rejected: subtasks share their parent's project, and slots mix projects; completing the parent would complete the children.
- Reusing `frame` with a date instead of weekdays. Rejected: a frame is a background guide that never holds tasks or counts toward capacity; mixing the two would make every reader branch on a flag.

## D2. Which tasks a slot shows

A slot **shows** an id from `task_ids` when the task is known locally, open, not deleted, and its due date (in the viewer's zone) is the slot's date or it has no due date. Other ids (completed are shown checked, see below; moved to another day on another device; deleted; not yet received) are kept in the list without a write, like unknown ids in `blocked_by`. Completed tasks of the slot's list are shown checked and struck in the checklist on the slot's day, so "2 of 5 done" can be read; they do not count toward capacity.

A task can be in at most one slot **per day as shown**: when two slots list the same open task (possible after concurrent edits), the slot created first shows it and the other skips it, without a write.

## D3. Adding sets the date, in the same batch

Adding a task to a slot writes, as one batch with one Undo: the slot's new `task_ids` and, when the task's due is not already the slot's date without a time, the task's `due` set to `{date: slot.date}` (time cleared; a time fixed to a zone keeps its zone field cleared with the time, as when dropping onto the unscheduled lane). Removing a task from any other slot of the same day is part of the same batch.

A task the user may not edit (a viewer of its shared project) can be added only when its due is already the slot's date; otherwise the drop is refused with "You can't change this task's date". The slot itself is always the user's.

When a slot is full (20 tasks), a drop is refused with a message.

## D4. Drawing a slot

A slot is a block in the grid between `start` and `start + minutes`, in the same layer as task blocks and laid out side by side with overlapping blocks and events (it takes part in the overlap marker). It uses `ui-block` with its colour, a stack icon, the title and a count, then a checklist: one 24 px row per shown task with a checkbox, the title and the estimate, in `task_ids` order; completed rows last. When the rows do not fit, the block shows as many as fit and "+n", which opens a popover listing all of them. A slot of 15 minutes shows only the title and count. Past days are dimmed as blocks are.

Each checklist row is a real task row for the keyboard: Tab reaches the slot, arrow keys move between rows, Space completes, Enter opens the task. The block's own menu offers Rename, Colour, Delete. Clicking the title or the count opens the slot's popover (title, time, the full checklist, Delete).

## D5. Moving, resizing, deleting

- Drag the slot's body or use arrows when it is selected: writes `date` and `start`; a change of date also writes each shown task's `due` date in the same batch (tasks the user cannot edit stay on their day and stop being shown, D2). One Undo.
- Drag the lower edge or `Shift`+up/down: writes `minutes` in 15-minute steps (at least 15).
- Delete: tombstones the slot; its tasks keep their date without a time and appear in the unscheduled lane. Undo restores the slot.
- Taking a task out (row menu, or dragging the row out of the slot onto the grid or lane) writes the slot's `task_ids` and, for a drop on the grid, the task's time like any drop.

## D6. Capacity

A slot counts toward the day's capacity (`time-blocking` "Overlap and capacity", Month and Plan totals) with `max(minutes, sum of its open shown tasks' estimates)`, and its tasks are not counted again. When the estimates exceed the slot's length, the count reads "50m in 45m" in the warning tone ("overfull"). This keeps the day's total honest without changing the live capacity requirement's text: the slot is one more item in the sum, as a task block is.

## D7. Placement with the keyboard

During a placement (`s`), when the proposed start lies inside a slot, the placement preview shows "Shift+Enter: add to Admin". Enter still places the task at that time as its own block, unchanged; `Shift+Enter` adds it to the slot (D3). The binding is registered in the shortcut registry in the placement context, where it has no other meaning.

## D8. Lists and other views

- Rows in Today, Upcoming and lists: a task shown in a slot shows the slot's start in the row's time column (`data-row-time`) with the stack icon and the slot's name in the tooltip, so Today reads in calendar order. No new property is added to the row.
- Month and Plan list slotted tasks as ordinary date-only tasks (out of scope to draw slots there), with capacity counted per D6.
- `replan-the-day` treats a slot as an obstacle (its interval is occupied) and does not move it.

## D9. API, CLI, MCP

- REST `internal/httpapi/slots.go`: `GET /api/v1/slots?from=&to=` (all scopes), `POST`, `PATCH /{id}`, `DELETE /{id}` (refused to `read` and `agent` tokens). `PATCH` with `task_ids` sets the list; with `"move_tasks": true` it also writes the tasks' due dates as in D3, refusing tasks the caller cannot edit with 403 and writing nothing. 422 for invalid times, lengths or more than 20 ids; 404 for unknown slots; 401 without a session.
- CLI: `ot slots [--from --to]`, `ot slots add "Admin" --date 2026-11-04 --at 16:00 --for 45m`, `ot slots put <slot> <task>…`, `ot slots rm <id>`.
- Agent tools: read tool `list_slots` and resource `opentodo://slots`; titles through `e2ee.Display`, marked untrusted. No write tool in this change.

## D10. Encrypted accounts, offline, sharing, phone

- `slot.title` is content and encrypted; servers and tools show "Encrypted slot" when they cannot decrypt.
- Offline: every action is local first; the batches upload on the next sync. Concurrent edits converge per field; `task_ids` as one whole-list value (one device's list wins, never a merge), with D2 keeping the display consistent.
- Sharing: slots are personal; other members see only the date change on a shared task they can see.
- Phone: below 640 px the Week agenda lists a slot as one row "Admin · 16:00–16:45 · 2 of 5" that expands in place to its checklist; the Day view draws it as on a desktop. Adding on a phone: the task's Schedule sheet lists that day's slots as "Add to Admin 16:00" choices.

## D11. Size and budget

No dependency; about 4 KB gzip in the calendar chunk, one table and one handler file on the server. Interface budget: no row of chrome (New slot is an overflow item and a palette command), no new task property (the time column already exists), no sidebar destination, no new scroll region (the slot's overflow opens a popover, the checklist does not scroll), one shortcut (`Shift+Enter`) in the placement context only, registered without conflict. Simple-list users never see slots.
