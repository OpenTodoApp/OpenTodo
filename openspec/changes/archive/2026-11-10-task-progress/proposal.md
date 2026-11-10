# Proposal

## Why

A reporter asked for a progress percentage (GitHub issue 1107): a parent's share rising as its subtasks are completed (four subtasks, 25% each), and a project's progress next to its title. Today a row shows "1/4" as plain text, the task panel shows "1 of 4" and a bar, and a project's progress is only in the All projects table. The count says how many; it does not show at a glance how far along a task is, and on the project page nothing does.

## What Changes

- **Rows and cards:** the subtask count ("1/4") gets a 12 px progress ring before it, in the count's own quiet colour. The count stays as it is. Assistive technology still reads "1 of 4 subtasks completed".
- **The task panel and the task page:** the Subtasks heading keeps "1 of 4" and its bar, and ends with the percentage ("25%", read as "25% done"). The assistant's task block puts the same ring before its "1 of 4".
- **The project page:** a ring and the percentage ("40%") lead the line beside the project's title, with the same rule as the All projects table (statistics "Project health"): completed tasks over completed and open tasks, a recurring series counted once, deleted, skipped and sample tasks left out. An area shows none. On a phone the bar's line under the title reads "40% done". All projects already shows the ring and the percentage, and is unchanged.
- **The rule for subtasks** stays the one the count already uses: direct, non-deleted subtasks. A subtask's own subtasks count toward that subtask, not toward its parent.
- Everything is worked out on the device from rows it already holds, offline too. No new op field, entity, route, setting, dependency or shortcut. Not **BREAKING**.

## Out of scope

- A manual progress slider. It would add a second, hand-set notion of "how done" next to completion, which would have to stay meaningful in sync, CalDAV and the agent tools.
- Labels set from progress ("In progress"). A routine can do that.
- CalDAV `PERCENT-COMPLETE`. Possible follow-up: write it from the subtask share on export, read it never (see design).
- The agent tools, MCP and the CLI. They don't show progress; see design D6.

## Roadmap

Advances the "UX polish (2026-11 feedback)" area of `ROADMAP.md`, from user feedback (issue 1107). It builds on `subtask-trees` (parent progress) and `projects-table` (project progress).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `subtasks`: "Parent progress" shows the share as a ring in rows and a percentage in the task panel.
- `project-organization`: a new requirement, "Project progress on the project page".

## Impact

- Web: `web/src/lib/progress.ts` (new: the project rule and its per-snapshot map), `web/src/lib/projectHealth.ts` (uses the shared rule), `web/src/app/TaskRow.tsx` (the ring in the counts and on cards), `web/src/app/task-detail/Subtasks.tsx` (the percentage), `web/src/app/ProjectHeader.tsx` (the project's progress), `web/src/app/assistant/blocks/TaskBlock.tsx`, `web/src/ui/ProgressRing.tsx` (a 12 px size) and `web/src/ui/Chips.tsx` (`ToneText` takes a leading mark).
- Server, CLI, sync, CalDAV: none.
- Docs: `docs/notes-and-subtasks.md`, `docs/projects.md`.
- Size: well under 1 KB gzip of first-load code. `ProgressRing` is already in the first load. See design for the measured numbers.
