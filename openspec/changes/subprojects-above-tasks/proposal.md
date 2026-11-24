# Proposal

## Why

Issue #1981: in a project with sub-projects, the "Sub-projects" group and the project's own tasks run together. The group's bar is the last bar above the tasks, so the tasks read as members of it, and a sub-project's mark sits 24 px left of a task's checkbox, so the project's own tasks look indented like subtasks.

## What Changes

- **A sub-project row keeps a task row's columns.** Its project mark sits in the checkbox column and its name where a task's title starts, so a top-level task lines up with the sub-projects above it and only a subtask is indented. It stays a project row: a mark instead of a checkbox, the name, and the open count of its subtree at the end; it opens the sub-project. 44 px tall on touch.
- **The project's own tasks get a "Tasks" bar** when the Sub-projects group is shown and nothing else heads them: the list layout with no sections and no grouping. The bar uses the shared group header with the open count and folds per project on this device, like the Sub-projects bar. Where sections or a grouping already head the tasks ("No section", a section, a priority), the first of those bars separates them and no Tasks bar is added. A leaf project has neither.
- **Board and timeline stay as they are**: the board shows no Sub-projects group, because its columns are the project's sections; the timeline keeps the group above its bars. The spec now says so.
- No new op field, entity, route, setting, dependency or shortcut. Not **BREAKING**.

Out of scope: listing sub-projects' tasks in the parent, dragging a task onto a sub-project row, keyboard cursor stops on sub-project rows (they stay buttons in the tab order), and the sidebar's project tree.

Roadmap: no ROADMAP.md item; a fix to the shipped `project-organization` "Sub-projects inside a project view" (issue #1981).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-organization`: "Sub-projects inside a project view" says how the group's rows line up with the tasks, when the tasks take a Tasks bar, and what the board and the timeline show.

## Impact

- Web: `web/src/app/SubProjects.tsx` (the rows' leading slot, `useHasSubProjects`), `web/src/app/task-list/ListGroups.tsx` (the Tasks bar on the project's headerless group); "Tasks" is an existing message.
- Tests: `web/src/app/subProjects.test.tsx`; the story `Screens/Task list/Project With Sub Projects` and its baselines.
- Docs: `changelog.d/Fixed/subprojects-above-tasks.md`.
- Size: a few lines; the first load stays within `web/bundle-budget.json`.
