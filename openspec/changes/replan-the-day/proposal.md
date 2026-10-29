# Re-plan the rest of the day

## Why

Time-blocking fails when the morning slips and the plan is never redrawn. Cal Newport's rule is to stop and make a fresh plan for the remaining hours rather than abandon it; on paper he leaves extra columns for that, and in digital calendars "users complain that dragging six missed morning blocks down one by one is tedious" (research.txt, §2.1 "Adaptive Mid-Day Re-Planning"). The research's roadmap asks for "a one-click Re-plan remaining day action that shifts incomplete blocks into open afternoon slots between now and the end of the workday (fully reversible with a single Undo)", and its anti-roadmap insists that schedule changes are "proposed as a preview that the user explicitly approves" (research.txt, phase item 3 and "Never Auto-Mutate the User's Calendar"). Today OpenTodo only offers "Move all to today" for earlier tasks and the carry-over in Close the day; nothing re-packs today's missed blocks.

## What Changes

- When today's grid has **missed blocks** (open tasks due today with a time whose block ended before now), the Day and Week header's lead line adds "3 blocks behind · Re-plan". The same action is in the calendar's overflow menu, Today's overflow menu ("Re-plan the rest of the day", which opens the Day view with the preview) and the command palette. Nothing appears while nothing is behind.
- **Re-plan** computes a proposal with a deterministic packer: the missed blocks, in their original order, go first-fit into the free time between now (rounded up to the next 15 minutes) and the end of the grid, around other open timed tasks and busy calendar events. Each keeps its length (its estimate, or the 30-minute default).
- The proposal is a **preview**: the new places as ghost blocks with the old places faint, and a bar under the header: "4 tasks move · 1 doesn't fit", **Apply** and **Cancel**. Tasks that do not fit are listed with one choice for all of them: **Leave them** (default) or **Move to tomorrow** (same time, next day).
- **Apply** writes all moves as one batch of ordinary due edits, offered with one Undo. Cancel or Escape writes nothing.
- Below 640 px the preview is a bottom sheet listing "10:00 → 14:30 Write report" rows with the same Apply and Cancel.

Not **BREAKING**: no op field, no route, no environment variable, no server change.

Out of scope:
- Re-planning another day than today, or the rest of the week.
- Re-planning date-only tasks (they have no block to miss), splitting a long task, or shortening blocks to make them fit.
- Gaps between blocks, minimum block lengths, or a "protect lunch" setting (frames from `calendar-frames` guide but do not block, see design D3).
- Server, CLI and MCP: the packer runs on the device only. An agent can still move tasks with the existing `schedule_tasks` tool; this is stated in the docs (design D6).
- Any automatic re-plan: nothing moves without Apply.

ROADMAP: 0.18 "The mindful daily planner", item `replan-the-day`.

No linked issue.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `time-blocking`: ADDED requirements for missed blocks and the entry points, the packer, the preview, and applying as one batch.

## Impact

- Data model, sync, op schema: none. Apply is a `mutateMany` batch of `task.due` edits (and nothing else), so it converges by last-writer-wins like any drag.
- E2EE: none. The packer reads due, estimate, completion, permissions and event times, never content; encrypted accounts work locked or unlocked.
- API, CLI, MCP, CalDAV, vault: no change. Moved tasks reach CalDAV clients, calendar sync and the vault as ordinary due edits.
- Web: `web/src/lib/replan.ts` (pure packer) with `replan.test.ts`; `web/src/app/calendar/ReplanPreview.tsx` (bar, ghost blocks, phone sheet); entries in the calendar header lead line and overflow, Today's overflow, the command registry.
- Docs: `docs/time-blocking.md` (or the calendar guide) gains "Re-plan the rest of the day"; CHANGELOG.
- Size: about 3 KB minified, lazily loaded with the calendar chunk. No dependency; server binary unchanged.
