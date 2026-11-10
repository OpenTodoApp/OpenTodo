# Proposal

## Why

The owner's November feedback is a list of craft faults in the screens people see all day.

- **The sidebar's top mark is the wrong mark.** It is the workspace switcher, but it borrows the app's check-mark, so the OpenTodo logo is nowhere to be seen as itself.
- **Task rows rarely line up.** The repeat icon sits above the title's baseline. "Evening" folds into the date text, so the date cell's content varies. The third cell holds labels on one row and a deadline or the subtask progress on the next, so its column is never one thing.
- **The task panel's head is out of line.** The checkbox does not line up with its title.
- **The panel's tab row scrolls sideways** once "Time · 1h 20m" appears.
- **Subtasks weigh as much as their heading.**
- **The estimate editor is a field plus six monospace buttons.**
- **A full Upcoming is a wall of every row of every day.**

None of these needs a new feature. Each needs the layout to do the work.

## What Changes

- **Workspace picture.** The workspace control shows the workspace's own picture: its icon on its colour, else its initial on its colour. Its name is always on one line. The app's check-mark is no longer used for a workspace.
- **Brand line.** The OpenTodo mark and name move to one quiet line at the sidebar's end, with the version ("OpenTodo 0.22.0"). The line opens Settings › About, where What's new lives, and carries the accent dot while there is unread news. A branded server shows its logo and name there.
- **Row grid.** From 40 rem of row width, every list row is checkbox | time | title and its marks | project | labels | estimate | date | assignee.
  - Each slot holds one kind of fact. The date ends the column.
  - An empty slot keeps its width, and a slot that no row of the list uses takes none.
  - The part of the day moves into the time column as its icon when there is no time.
  - The priority mark, the repeat icon and the counts are smaller and sit on the title's first baseline.
  - Detailed rows, cards, the phone row and both densities keep their shapes. Their marks follow the same baseline rule.
- **Task panel:**
  - The checkbox is centred on the title's first line, and the title is one step smaller.
  - Rows use the panel's 32 px step.
  - The tab row fits its width: icons with counts when narrow, never a sideways scroll.
  - Subtasks are a heading with weight over a quiet checklist.
  - The estimate editor is one field with ↑ and ↓ and four presets.
- **Calm Upcoming.** A display option, "Later days: Summarised" (the default) or "In full". The first three days with tasks stay in full, and each later day is one bar with its count and first titles, opened in place.
  - It is kept as one additive `user_prefs` field.
  - It belongs to this change rather than to a new one, because it is the same list craft: rows, group bars and display options.
- Not **BREAKING**: one additive op field, no new route, no new mandatory environment variable, no dependency.

Out of scope:
- Merging the Activity and History tabs (see design D6).
- Board cards and the calendar blocks.
- The phone row, which already shows one cell.
- New row facts.
- Settings › About and What's new themselves.

Roadmap: the "UX polish (2026-11 feedback)" area of ROADMAP.md, row 1. It follows up Precision (`precision-rows`, `precision-shell`) and `workspaces`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: the sidebar's header shows the workspace picture (Sidebar header row, Sidebar structure), the brand line ends the sidebar, and "Workspace control on two lines" is removed.
- `instance-branding`: the branded logo and name move from the sidebar header to the brand line.
- `task-list-presentation`: the row's slots and their order (One row anatomy), the part of the day in the time column (Time column), and the marks on the title's baseline (Metadata language).
- `web-app`: the panel's proportions, tabs that fit, the quiet subtask checklist and the compact estimate editor.
- `builtin-view-options`: Upcoming's Later days option.

## Impact

- Web:
  - Sidebar: `web/src/app/Sidebar.tsx`, `WorkspaceControl.tsx`, `SidebarFooter.tsx` (the brand line) and `InstanceBrand.tsx`.
  - Rows: `web/src/app/TaskRow.tsx`, plus "The property column" and "The phone row" in `web/src/index.css`.
  - Task panel: `web/src/app/task-detail/TaskHead.tsx`, `ConversationTabs.tsx`, `Subtasks.tsx`, `web/src/app/EstimateField.tsx` and `web/src/ui/Tabs.tsx` (a fit mode).
  - Upcoming: `web/src/app/calendar/UpcomingAgenda.tsx` and `web/src/app/task-list/ListGroups.tsx` (summary bars).
  - Stories and baselines for the sidebar, the rows, the panel and Upcoming, plus strings in every catalogue.
- Sync: one additive `user_prefs.upcoming_later` (string, `""` = Summarised) in `internal/sync/ops.go` `Schema`, with the generated files regenerated. A 1.0 client stores and forwards it untouched.
- Docs: `docs/interface-guide.md` (The three columns, Rows and chips), `docs/design-system.md`, `docs/task-panel.md`, `docs/today-and-upcoming.md` and `docs/workspaces.md`.
- Size: CSS grid rules and small components. Under 2 KB gzip on the first load, because the sidebar and the rows are on it. The budget headroom is small, so the implementation measures this and raises `web/bundle-budget.json` on purpose, with its reason, if needed. The panel parts and the Upcoming bars are in their existing lazy chunks. No dependency.
