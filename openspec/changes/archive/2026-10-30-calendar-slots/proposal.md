# Slots: several small tasks in one calendar block

## Why

Ten five-minute admin tasks placed on the grid make ten slivers that cover each other and say nothing; left in the unscheduled lane, they never get a time. Akiflow's **Slots** solve this: one calendar block, "Admin · 16:00–16:45", that holds a checklist of the small tasks done in it. The research calls this out together with Frames: "Dropping multiple small tasks into a Slot groups them as a single clean calendar container with an internal checklist rather than cluttering the calendar with tiny 5-minute blocks" (research §"Commercial daily planners" and roadmap P2.2; Newport's task batching, §2.1). `time-blocking` "Short blocks never cover each other" keeps slivers readable, but the grid still fills with them.

## What Changes

- A new personal entity, the **slot**: an optional title, a date, a start time, a length, a colour and the ordered list of tasks it holds (at most 20). Slots sync to the user's own devices only, through the op log, offline first.
- Day and Week draw a slot as **one block** with a stack icon, its title (or "Slot") and a count ("2 of 5 done"), and inside it a **checklist** of its tasks with checkboxes, as many as fit; the rest open in a popover. Tasks in a slot are not drawn again as their own blocks or in the unscheduled lane.
- **Adding**: drop a task (from a list, the planning list, the unscheduled lane or a block) onto a slot; with the keyboard, during a placement (`s`) `Shift+Enter` adds the task to the slot under the cursor. Adding sets the task's due to the slot's date without a time, in the same batch, so it shows in Today and Upcoming on that day.
- **Creating**: **New slot** in the Day and Week overflow menu and the command palette; **New slot here…** in the empty-slot menu (`calendar-clarity`, #555); **Make a slot here** in a frame's popover (`calendar-frames`), filling the frame's occurrence.
- **Moving and resizing** a slot works like a task block; moving it to another day moves its tasks' dates in the same batch, with one Undo.
- **Taking out**: a row's menu offers Take out of slot (the task stays on that day, without a time); deleting a slot returns its tasks to the unscheduled lane, with Undo.
- **Capacity** counts a slot's length once (or its tasks' estimates when they add up to more, marked "overfull"), never each task again.
- In lists, a task held by a slot shows the slot's start time in the row's time column with the stack icon, so Today reads in calendar order.
- REST `/api/v1/slots`, `ot slots` in the CLI, a read tool and resource for assistants. Encrypted accounts encrypt the slot title.

**Depends on `calendar-frames`.** Slots reuse what that change introduces: the `kClock` value kind, the personal-entity pattern with its migration, store and REST/CLI/MCP shape, the layering of the Day and Week grid, and the frame popover where **Make a slot here** lives. `calendar-frames` must be applied first; this change must not be applied alone.

Not **BREAKING**: one new entity (additive), new routes behind sign-in, no environment variable.

Out of scope:
- Repeating slots ("Admin every weekday"): a frame plus Make a slot here covers the habit; a recurring slot needs occurrence exceptions.
- Slots shared with project members, slots in Month and Plan (they show their tasks as usual there), and exporting slots as events (CalDAV, calendar feed, calendar sync).
- Moving a missed slot in `replan-the-day` (re-planning treats slots as fixed obstacles in this release).
- Subtasks of a slotted task inside the checklist (the parent is listed; its subtasks stay on its page).

ROADMAP: 0.18 "The mindful daily planner", `calendar-slots` (research P2.2).

Relates to #555.

## Capabilities

### New Capabilities

- `calendar-slots`: the slot entity, how slots hold tasks, how Day and Week draw and edit them, capacity, list rows, and the API, CLI and MCP surface.

### Modified Capabilities

None. How slots meet capacity, placement and list rows is stated in the new capability so the live requirements stay untouched while `meeting-aware-capacity` and `calendar-clarity` change nearby ones.

## Impact

- Data model and op schema: new entity `slot` in `internal/sync/ops.go` (personal scope), using `kClock` from `calendar-frames`, `kDate`, `kPositiveInt` and `kIDList`; `schema_fixture.json`; `web/src/lib/types.ts`, `ops.ts` defaults, a Dexie store; migration `NNNN_slots.sql`. No task field is added: membership lives on the slot, so shared tasks are untouched for other members.
- E2EE: `slot.title` in `internal/e2ee.ContentFields` and `CONTENT_FIELDS`.
- API: `internal/httpapi/slots.go` (`signedIn`; writes refused to `read` and `agent` tokens), `ApplyStrict` + `NotifyApplied`; `docs/api.md`, route matrix.
- CLI: `ot slots`, `ot slots add`, `ot slots put <slot> <task>…`, `ot slots rm`.
- MCP: read tool `list_slots`, resource `opentodo://slots`.
- CalDAV and vault: none (a slotted task is an ordinary date-only task there).
- Web: `web/src/lib/slots.ts`, `web/src/app/calendar/SlotBlock.tsx`, the drop layer, `TaskRow`'s time column, the capacity helper.
- Bundle: about 4 KB gzip; no dependency. Binary: a few KB.
- Docs: new `docs/slots.md`, links from `docs/time-blocking.md` and `docs/frames.md`; strings in six catalogs; CHANGELOG.
