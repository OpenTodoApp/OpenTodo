# Proposal

## Why

Today, Upcoming and the Inbox are the lists people open most, but they cannot be grouped or ordered differently. Someone who wants Today by project, or the Inbox newest first, has to build a saved view that copies the built-in one and set it as their start view ([#872](https://github.com/OpenTodoApp/OpenTodo/issues/872)). Subtasks in Today and Upcoming are always flat, each with a breadcrumb, so a parent and its children due on the same day read as unrelated rows ([#1089](https://github.com/OpenTodoApp/OpenTodo/issues/1089) item 5, [#1108](https://github.com/OpenTodoApp/OpenTodo/issues/1108)). The maintainer's answer on #872 sets the plan: the Display options panel that projects and saved views already have, on the built-in views, with a Reset back to the default.

## What Changes

- Today, Upcoming and the Inbox get the **Display options** button in their header (on a phone, in the bar's slot that projects and labels use). It opens the existing panel with the parts each view can take:
  - **Today:** Rows, Group by (Time of day by default, then Project, Priority, Label, None), Order by (Due date by default, then Priority, Created, Deadline, Title and sortable custom fields), direction under More options, and **Nest subtasks**.
  - **Upcoming:** Rows, Order by within each day, direction, and Nest subtasks. No Group by: Upcoming is its days.
  - **Inbox:** Rows, Group by (None by default, then Due date, Priority, Label), Order by (Manual order by default, then Priority, Due date, Created, Deadline, Title), direction. The Inbox is already a tree, so it has no Nest subtasks switch.
- What each view means stays fixed. Grouping and order change how the tasks are laid out, never which tasks are listed. In Today, Earlier stays first and keeps its actions. Blocked, Waiting for a slot and Done today stay at the end. The Today limit fills its slots in its own order. Upcoming keeps one group per day.
- **Nest subtasks** (off by default) lists a subtask under its parent when both are in the same group, indented and collapsible as in a project. A subtask whose parent is not in that group stays a flat row with its breadcrumb, as now.
- **Reset** at the foot of the panel, shown only while the view differs from its default, puts every option of that view back.
- The `r g`, `r o` and `r r` keys work on the three views where the panel offers the choice. Today adds `r g t` for Time of day.
- A manual move in the Inbox while it shows another order switches it back to Manual order first, as a project does. Today and Upcoming still have no manual order.
- The choices are personal, synced account preferences: thirteen additive `user_prefs` string fields. An empty or unknown value reads as the view's current behaviour. They are written locally first, work offline and converge per field. Older clients ignore the fields and keep showing the defaults. Not **BREAKING**: no new environment variable, no change to the op log format.
- With every option at its default, each view looks exactly as it does today.

## Capabilities

### New Capabilities

- `builtin-view-options`: Display options on Today, Upcoming and the Inbox: what each view offers and refuses, how grouping and order fit each view's fixed groups and the Today limit, Nest subtasks, Reset, storage and convergence.

### Modified Capabilities

- `subtasks`: "Flat display in cross-project and date views" allows the Nest subtasks option on Today and Upcoming.
- `keyboard-shortcuts`: "Group and order keys" works on Today, Upcoming and the Inbox where their panel offers the choice, and adds `r g t`.
- `manual-ordering`: "Which views are manually ordered" adds the Inbox's switch back to Manual order on a move.
- `row-layouts`: "Where the row layout is chosen" lets Today, Upcoming and the Inbox choose their own row layout in the panel.
- `upcoming-start-with-today`: Today's groups at the top of Upcoming follow Today's own display options, so they keep matching Today.

## Impact

- Web: `web/src/lib/listDisplay.ts` (per-view defaults, choices and reads), `web/src/lib/listGroups.ts` (Today's day groups under a chosen grouping, per-group order and nesting, the Inbox's grouping through the project path), `web/src/app/task-list/useListModel.ts` and `useListDisplay.tsx` (wire the three views), `web/src/app/views/DisplayPanel.tsx` (leave out Group by when a view offers none, the Nest subtasks switch, Reset), `web/src/app/views/useDisplayKeys.ts` and the shortcut registry (`r g t`).
- Server: thirteen fields in `internal/sync/ops.go` `Schema` under `user_prefs`, plus the generated `opSchema.ts` and contract fixture. No route, no migration, no new dependency. The export and the own-export import carry them with `user_prefs`.
- Agent tools, MCP, REST, the CLI, CalDAV, display mode, sidebar counts, the icon badge and the briefing are unchanged. They read which tasks are in each view, never how the web app lays them out.
- Bundle: the panel and the grouping code are already on the first load (Today renders them for projects and labels through the same modules). The added code is per-view tables, one switch and a button, estimated under 1 KB gzip. It must fit `web/bundle-budget.json` (`initialGzipKB` 693) without raising it. If the measurement says otherwise, the panel body moves behind a lazy import before the budget changes.
- Docs: `docs/built-in-views.md`, `docs/today-and-upcoming.md`, `docs/upcoming-with-today.md`, `docs/today-limit.md` (one line saying the order does not change the slots) and the keyboard guide (regenerated from the registry).

Out of scope, each a follow-up of its own if wanted:
- Board layout for the built-in views: Today's fixed groups do not map to columns.
- Show completed tasks: Today has Done today, and Upcoming lists the future.
- Hiding row properties (Show on rows): project and label pages do not offer it either. See the open questions in the design.
- Extra filters on built-in views: Today and the Inbox keep the duration filter and Upcoming keeps its query filter. A saved view is the place for a different set of tasks.
- Dimmed parents outside the view, shown for context (#1089 item 5): see the open questions in the design.
- Reset on project and label pages, and Nest subtasks on saved views and label pages.
- The Inbox's triage mode keeps its queue in the Inbox's manual order.

ROADMAP: no row names this yet. It is the "Display options for the built-in views" the maintainer planned on #872, labelled `after-1.0`. It advances the saved-views row (`custom-views`) by bringing its display panel to the built-in lists.
