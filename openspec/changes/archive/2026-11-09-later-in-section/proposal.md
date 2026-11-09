# Proposal

## Why

User feedback (no issue yet): a user organised tasks into a project's sections, gave some of them a start date, and saw them "move to a new section labeled Later" at the end of the list. In a project grouped by section, the one project-wide Later group (someday-and-evening D2, subtasks-follow-later) takes deferred and parked tasks out of the section they were filed in, so the section no longer shows everything it holds and the tasks can't be managed where the user put them.

## What Changes

- In a project's list grouped by section (the default), a deferred or parked task stays in its own section: after the section's active tasks, under a quiet folded **Later** heading with its count. It is folded by default and its open state is kept per device, like Today's Blocked group. "No section" works the same way, and is listed when it holds only Later tasks.
- Subtasks follow their top-level task exactly as before: a deferred or parked parent takes its subtree into its section's Later; a deferred subtask of an active parent stays under it.
- A collapsed section hides its Later too. Dropping a task beside a Later row places it in that section.
- Unchanged: a project without sections, a list grouped by None, Due date, Priority or Label, and the project timeline keep the one Later group at the end; the board keeps cards in their columns (no Later there); Today, Upcoming, Anytime, Someday and the counts keep deciding per task.

Out of scope: opening a section's Later automatically when the selected task moves into it, a Later inside other groupings, and the display screen's Later group. No ROADMAP item; it refines the shipped `someday-and-evening` (row 2) and `subtasks-follow-later`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `start-dates`: "Deferred tasks", "Someday" and "Start shortcuts in a list" name the section's Later.
- `subtasks`: "Subtasks in a project's Later group" covers a section's Later.
- `list-display-options`: "Grouping and order of a project or label list" says where Later is under each grouping.
- `task-list-presentation`: "Group headers" and "Empty groups" describe a section's Later heading.

## Impact

- Web app only: `web/src/lib/listGroups.ts` (`listGroups` puts a section's Later after it, `laterBySection`, `laterOpenKey`, `sectionOfRows`), `web/src/app/task-list/useListModel.ts` (passes the project and the timeline), `web/src/app/task-list/ListGroups.tsx` (`SectionLater` inside `SectionGroup`). Tests in `web/src/lib/listGroups.test.ts`, `web/src/lib/incrementalEquivalence.test.ts`, `web/src/app/somedayViews.test.tsx`.
- No op field, sync, API, CLI, MCP, encryption, dependency, string or server change; nothing to migrate, and a 1.0 client shows the same tasks in its own Later group. First-load JS grows by about 0.3 KB gzip (692.0 to 692.3 KB; main was already just over its 692 KB budget), so `web/bundle-budget.json` is raised to 693 KB with the reason.
- Docs: `docs/deadlines-and-start-dates.md`, `docs/group-and-order.md`, `docs/built-in-views.md`.
