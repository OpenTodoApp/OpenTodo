# Design

## Context

Ten routes (`ListScope` in `web/src/lib/listGroups.ts`: inbox, today, upcoming, anytime, someday, completed, assigned, project, label, place) are one screen, `TaskListView.tsx`. Its data is already a hook, `useListModel`. Its wiring is not: about 180 lines of the component body compose selection (`useTickedRows`), the manual orders (`useOwnOrder`, `useDayOrderPage`, `useListReorder`), drag (`useListDrag`), adding with the view's defaults, completion with the parent prompt, the row menu (`useRowMenu`), the keyboard (`useListShortcuts`), the row actions (`useListBindings`) and the header's phone actions (`usePhoneListActions`). Rows are drawn by `TaskRow.tsx` (1,075 lines) through `useRowRenderer`.

`phone-ui-trial` drew Today with `useListModel` and three calls of its own. That was enough for a trial and is why Today lacks everything listed in the proposal. Repeating it for nine more lists would copy the wiring; the rule of `phone-ui-trial` D4 is one hook per feature, two views.

Measured on a phone below 768 px with the switch off, the list already uses sheets for its row menu, bulk actions, display options and filters. Those are kept. What is replaced is the page: header, groups, rows.

## Goals / Non-Goals

**Goals**

- Parity: every action a task list offers on a phone today is reachable in the phone list, with the same writes.
- One wiring: `TaskListView` and the phone list draw from the same hook; neither holds list logic of its own.
- The phone list is one screen with per-list parts, not ten screens.

**Non-Goals**

- A project's Board, Timeline and Calendar layouts; the lists that are not `TaskListView` (filter, saved view, Next, Waiting, Trash, Triage, reviews, Habits).
- New editors. Only the date sheet is phone-made; every other editor is the present one in its present sheet.
- Row details under a row (`RowDetails`): on a phone its control appears only once expanded, so it is reachable by keyboard alone today. A tap opens the task page, which shows the same facts.
- Windowed lists, tablets, the switch's default.

## Decisions

### D1. `useListScreen`: the wiring moves out of `TaskListView`

`web/src/app/task-list/useListScreen.ts` takes `(route, userId, userRole, refs)` and returns what the component body computes today, grouped: `model` (`useListModel`), `groups` and `columns` after motion and Upcoming's calendar, `selection` (ticked, select mode), `order` (manual, own order, reorder), `drag`, `add` (`onAdd`, `onAddMany`, the add lines), `complete` (`toggleComplete`, the prompt), `rowMenu`, `rowActions`, `inline`, `header` (title, meta, page actions, the phone slots and menu groups), `agenda`, `ready`. The helper hooks defined in `TaskListView.tsx` (`useListUi`, `useTickedRows`, `useOwnOrder`, `useDayOrderPage`, `useListReorder`, `useListAdd`, `useListFrame`) move with it.

The move is mechanical: the body is already only hooks before the first `return`, so their order is kept and no effect changes. `TaskListView` keeps its render and the desktop-only calls (`useListFrame`, the sticky add row, `useRowRenderer`). The existing list tests (10,690 tests pass before the move) are the check that nothing changed; no test is edited to make it pass.

`useListShortcuts` stays in the hook. Its handlers are registered for both screens, so a phone with a keyboard keeps the list's keys.

Alternative: the phone list calls the smaller hooks itself. Rejected: it is the copy this change exists to avoid, and the order of those calls carries meaning (the drag reads the selection, the bindings read the drag).

Alternative: restyle `TaskRow` for the phone UI. Rejected: it is the responsive screen again; `phone-ui-trial` D5 found that the desktop row's structure is what makes the screen read as a web page.

### D2. One screen, parts per list

`web/src/phone/screens/PhoneList.tsx` is the container: it calls `useListScreen` and maps its result to props. `PhoneListView.tsx` only draws (D5 of `phone-ui-trial`): header, an `above` slot, groups, a `below` slot, the selection bar. `PhoneToday` and `PhoneTodayView` are replaced by it; their stories and tests move to the list's.

Per-list parts are small components chosen by `route.view` in the container, each rendering an existing component in a slot:

| List | Above the groups | In the groups | Below |
| --- | --- | --- | --- |
| Inbox | routines slot, sample notice | | |
| Today | briefing, events, habits strip, away notice | Earlier actions, Done today, Log a win | Close the day |
| Upcoming | events note | each day's events, summarised later days | |
| Completed | search | | show earlier |
| Project | note, linked references, sub-projects | section headers | Add section, hidden tasks note |

Shown as they are: `TodayAgenda`, `TodayStrip`, `UpcomingEventsNote`, `RoutinesInboxSlot`, `CompletedSearch`, `ProjectNote`, `EmptyState`, `FilteredEmpty`, `MissingTarget`. They join the eslint allow-list; a desktop screen never does.

### D3. The header reuses the list's phone actions

`usePhoneListActions` already reduces a list's header to what a phone bar can hold: `slots` (the controls shown) and menu groups. The phone list's `PhoneHeader` shows up to two slots and one menu built from those groups plus the list's own menu (`InboxMenu`, `LabelMenu`, the project's groups, Today's and Upcoming's items from `ListHeader`). The items are the same objects, so an item added to a list's menu later appears in both screens.

The items now built inline in `ListHeader` (`TaskListView.tsx`, the briefing, events, parts of the day, limit, Replan, Away, Brief me) move into a function both headers call, `listMenuGroups(route, screen)`.

Interface budget (`docs/interface-guide.md`): one row of chrome (the bar) above the title, and the title scrolls away; a list's first item is under at most two rows. One vertical scroll region, the shell's. No new shortcut.

### D4. Rows: `PhoneRow` grows three things

- **Depth and fold.** `PhoneRowModel` gains `depth` (0 to 2, indented 24 px a step) and `fold` (`{ open, onToggle, count }`), shown as a 44 px control at the row's end.
- **Selection.** In select mode the check is a tick box and a tap on the row ticks. The row takes `selecting` and `ticked`; the gesture hook is off.
- **Hold and drag.** The row's `onPointerDown` is the list's own (`rowActions`), so the 350 ms hold, the menu on release and the drag on a move are the code and timings of today. `useListDrag` finds rows and drop places by data attributes; `PhoneRow` and `PhoneGroup` carry the same attributes (`data-task-id`, the group and section keys), and the drop line is drawn by the list's indicator from `drag.dropAt`.

Edit title, Add task below and Add subtask render the present `InlineEditor`, `SiblingInput` and `SubtaskInput` in a slot of the row, since they must mount inside the tap for iOS to raise the keyboard.

The facts line is unchanged (`rowModel`, at most four facts).

### D5. Selection bar and sheets are the present ones

`SelectionBar`, `BulkActionsMenu`, the row menu, the display options panel and the filter sheets are already bottom sheets on a phone and already follow the keyboard. They are rendered by the container as they are. Restyling them is not part of parity and would be a second change to review.

### D6. No add line at the top

The desktop list's add row is not sticky below 768 px and scrolls away; the add button is always there and opens the sheet with the list's defaults (`withDefaults` in the hook). The phone list drops the row. The sheet takes the same `onAdd` and `onAddMany`, so paste-many and the defaults are the list's. A section's add and a row's add lines stay in place (D4).

### D7. Which screen draws a route

`Shell.tsx`: with the phone UI on, a `ListRoute` renders `PhoneList`. `PhoneList` returns the present `TaskListView` for a project whose layout is not List, so a layout switch needs no reload and the board keeps its code. The phone list is one lazy chunk; `PhoneToday`'s chunk goes.

### D8. Checks

- `phoneLists.test.tsx` (happy-dom, through `Shell`): for each of the ten routes, the phone list shows the ids, groups and order `useListModel` gives; then the behaviours of the spec, one test per scenario.
- An equivalence test: for a seeded account, every item id of the desktop list's phone menu is present in the phone list's menu, per route. It fails when a menu item is added to one screen only.
- Stories for every new component and for the screen in each list's state; axe and the visual baselines run on them.
- `scripts/ux-audit/layout-screens.mjs`: the screens with a phone view become every list screen, and `PHONE_UI=1` in CI runs them at 360 and 390 px in Chromium and WebKit.

### D9. Size

Reported after the build in `tasks.md` 7.1: the entry chunk and the first load against `web/bundle-budget.json` (today 100.6 and 660.0 of 148 and 712 KB), and the phone list chunk. Moving the wiring into a module of its own does not add code to the first load: `TaskListView` already loads it.

## Risks / Trade-offs

- **The move breaks a list behaviour without a test noticing** → the move is its own commit with no other edit; the whole web suite and the layout check run on it before anything is built on top.
- **Drag depends on DOM details of `TaskRow`** → 2.4 reads `useListDrag` and `lib/dnd.ts` first and lists the attributes it needs; if the phone row cannot meet them, the fallback is the menu's Reorder plus a drag handle, and the spec's hold-and-move scenario is amended openly.
- **The list is long (500 rows)** → the phone row is lighter than `TaskRow`; measured in 7.2 on the 10,000-task account against the list budgets of `docs/performance.md`.
- **Half of the app is still the old layout** → unchanged by this change; the switch stays off by default.

## Migration Plan

No data. The switch decides per device; turning it off returns every list to the present screen. `phone-ui-trial` must be merged first: this change builds on its branch.
