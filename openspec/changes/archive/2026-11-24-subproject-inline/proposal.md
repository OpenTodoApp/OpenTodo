# Proposal

## Why

Issue #1665 (from kwong on Discord, coming from Things 3): a sub-project's tasks can only be seen by opening it. A person who keeps "Garden" and "Kitchen" inside "Home" wants to look into one without leaving Home, the way a folder opens in a file list. The contributor Kechos23 showed the idea in a local prototype: an arrow on each sub-project, its open tasks first, then its own sub-projects, editable rows that keep their own project's permissions. The owner approved it: editable, nested, built in the project's list.

## What Changes

- **A sub-project row opens in place.** The empty 16 px fold slot of a sub-project row holds an arrow. It opens the sub-project inside the parent's list: its own open tasks (with their subtasks, in its section order, no section bars), then its own sub-projects as the same rows, one step further in. Clicking the name still opens the sub-project. Open or folded is kept per device, folded by default.
- **Its tasks are list rows.** `j`/`k`, `x`, Enter, `.`, inline editing and Undo work on them. Completing and editing follow the role in the task's own project, so a viewer of that project sees read-only rows. A task reorders only among the tasks of its own project; a drop on a sub-project row moves the task into that project (the ring, the toast and Undo of a drop on a sidebar project), and a drop on the "Tasks" bar moves it to the parent.
- **The view's choices apply inside.** Its sort, query filter and duration filter apply to each opened sub-project. Quick add still adds to the parent. With a grouping or the columns layout on, no arrow is offered. The board shows no sub-projects (as before); the timeline keeps them above its bars, without the arrow.
- No new op field, entity, route, setting, dependency or shortcut. Not **BREAKING**.

Out of scope: the board, the timeline's bars, cursor stops on the sub-project rows themselves, and the sidebar's tree.

Roadmap: no ROADMAP.md item; it extends the shipped `project-organization` "Sub-projects inside a project view" (issue #1665).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-organization`: "Sub-projects inside a project view" lets a sub-project open in place with its tasks and its own sub-projects, and says what works on those rows and which of the view's choices apply.

## Impact

- Web: `web/src/lib/listGroups.ts` (the Sub-projects bar and one group per shown sub-project), `web/src/app/task-list/useSubProjectList.ts` (the opened sub-projects' tasks from a project index, patched from each write), `web/src/app/SubProjects.tsx` (the row with its arrow and drop target), `web/src/app/task-list/ListGroups.tsx`, `useListModel.ts`, `useListDrag.ts`, `collapsedRows.ts`. "Expand {name}" and "Collapse {name}" are existing messages.
- Tests: `web/src/lib/listGroups.test.ts`, `web/src/app/subProjects.test.tsx`; stories and their baselines.
- Docs: `docs/projects.md`, `changelog.d/Added/subproject-inline.md`.
- Size: under 1.5 KB gzip in the first load, within `web/bundle-budget.json`.
