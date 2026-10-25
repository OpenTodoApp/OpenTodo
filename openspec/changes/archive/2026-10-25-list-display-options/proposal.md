# Display options on project and label pages

## Why

Issue #368: saved views have had **Display options** since 0.11.0, but a project and a label page could only show their tasks one way (a project by section in manual order, a label by project). People want to look at the same tasks from another angle, by priority or by date, sorted by deadline or title, without building a view for each project or label, and want that choice remembered for each project and label.

## What Changes

- Project pages (list layout) and label pages get the **Display options** button in their header, the same panel saved views use, with the parts that apply:
  - **Group by**: on a project Section (default), None, Due date, Priority or Label; on a label Project (default), None, Due date or Priority.
  - **Order by**: Manual order (default), Priority, Due date, Created, Deadline or Title; the direction under **More options**.
- The choice is stored per project and per label, personal to the user, synced to their own devices, and survives restarts. On a shared project each member keeps their own.
- Grouping and order apply to top-level tasks; subtasks stay under their parent in manual order. A task with several labels is listed once, under its first label in label order. Later and Completed stay at the end.
- Dragging a task among rows, or moving it with Alt+Up/Down, while another order is shown switches the project to **Manual order** first; the move then applies.
- Saved views and the New view page can also order by **Deadline** (undated tasks last), since the panel is shared.

Not **BREAKING**: additive op fields only (`project_prefs.group_by|sort_by|sort_dir`, `label.group_by|sort_by|sort_dir`) and one new value of a view's `sort_by` (`deadline`), which older clients read as the default.

Out of scope: a board layout, completed tasks and row properties for project and label pages (projects keep their own List/Board/Timeline switch and Show completed tasks); dragging on label pages (they stay sorted lists, as before); display options for Today, Upcoming and the Inbox. Advances the ROADMAP's "views and display" line.

## Impact

- Server: `internal/sync/ops.go` Schema and its fixture, `internal/httpapi/views.go` (accepts `sort_by: "deadline"`).
- Web: `web/src/lib/listDisplay.ts` (new), `listGroups.ts`, `views.ts`, `types.ts`, `ops.ts`, `liveData.ts`; `TaskListView`, `useListModel`, `useListDrag`, `useListShortcuts`, `views/DisplayPanel`.
- Docs: `docs/projects.md`, `docs/labels-and-filters.md`, `docs/filters.md`, `docs/api.md`, `docs/sync.md`; CHANGELOG.
- No new strings beyond those the panel already has; no dependency, no size change.
