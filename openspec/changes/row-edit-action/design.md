# Design

## Context

- The revealed actions (`rows-v2` D7, `RowActionCluster`): Show details, Schedule, Priority, More, on a fine pointer from 768 px; a viewer's row has Show details only.
- The inline editor (`inline-task-editing`): title, then Date, Priority, Labels, Project and Open details (Shift+Enter). `F2` opens it on the cursor row; a second click on the selected title opens it (`click-selects-title` D1). The touch row menu's **Edit title** opens a compact form of it with Save and Cancel (`click-selects-title` D8).
- The side panel follows the cursor (`task-side-panel` D4, `useSidePanel`); the Inbox's split follows it too (`inbox-split` D1). `startInline` sets the cursor, and the revealed More sets it before its menu opens, so either moves the panel to the row.
- `row_click` (`click-default`) and `task_open` (`task-side-panel` D1) are synced account preferences.

## Decisions

**D1. Edit takes Show details' place.** The cluster stays at four actions (the spec's limit and its 24 px targets), and Edit is the action the issue asks to see. Show details stays one key away (→) and moves into the row menu (D2); the touch disclosure is unchanged. Edit is shown where the row has the inline editor and the user may change the task: the list layout of every `TaskListView` list. Elsewhere (a viewer's row, the Filter view, saved views, Next, Waiting) the cluster keeps Show details, so no row shows an action that does nothing. Its click stops at the button: the editor replaces the cluster at once, and the click must not reach the row as a click on its empty area. Alternative: a fifth action. Rejected by the owner: it crowds narrow rows and breaks the four-action spacing.

**D2. The row menu: Edit, Show details, Open details.** One task's menu in those lists (More, `.`, the right-click and the touch hold) holds the three, after Complete: **Edit** with `F2` (the label covers the editor's Date, Priority, Labels and Project, so **Edit title** is renamed), **Show details** / **Hide details** with → / ←, and **Open details** with Enter. Open details runs Enter's rule for that task: the side panel shows it (a second time, its page), the Inbox's split opens its page, otherwise its page; no popup (owner's answer). Edit opens the `F2` editor with a fine pointer from 768 px and the compact one with Save and Cancel otherwise, so a phone keeps `click-selects-title` D8. A menu for several ticked tasks has none of the three, and below 768 px Show details is left out, since a phone's rows do not expand (`phone-row-controls`).

**D3. An edit keeps the task beside the list.** The list holds `{ row, kept }` when an edit starts (Edit, the menu, `F2`, a second click) or More opens on a row while another task is shown beside the list; the side panel and the Inbox's split follow `kept` instead of the cursor while the cursor stays on that row. The hold ends when the cursor moves (any key or click that selects another row), when a row is clicked (`RowActions.open` releases it; a click on the selected row's empty area now passes `select`, which shows it there), or when another task opens there (Shift+Enter, Open details, a link in the panel). Closing the pane ends it without showing the row, so a closed pane stays closed until the cursor moves. Schedule and Priority in the cluster never moved the cursor, so they need nothing. Alternative: let the panel follow once the edit ends. Rejected: the issue's example is editing B while reading A, and a panel that jumps on Save loses A all the same.

**D4. Keyboard and touch.** No new key. `F2` already opens the editor; the cluster's Edit is a real button after the row's open control, as Show details was, so Tab reaches it first. Enter opens, → and ← expand. On touch the cluster is not rendered and the row menu is the way in, with the same items.

## Data model

None. No op field, entity, route or setting; the hold is the list's own state, never stored or synced.

## Interface budget

No row of chrome, task property, sidebar destination, scroll region or shortcut is added. The cluster keeps four actions; the row menu gains two items for one task.

## Size

No dependency. A few hundred bytes in the list's chunk; the first load stays within `web/bundle-budget.json`.
