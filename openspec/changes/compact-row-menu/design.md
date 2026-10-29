# Design

## Context

The task Actions menu (`bulkMenuGroups` in `web/src/app/bulk/BulkActions.tsx`) is the one menu behind the keyboard's `.`, the selection bar and, since `task-row-context-menu`, the right-click. Nine of its rows were the four priorities and five date choices. `Popover` already caps a panel at the viewport and scrolls it, but a menu that has to scroll on a normal laptop screen is still too long.

## Decisions

### D1: A submenu, not a row of buttons

The `action-menus` spec rules out rows of side-by-side buttons in a menu, so Priority and Date are not turned into inline icon rows (the Todoist pattern). A `submenu` item swaps the menu's items for its own, the same way picker and step items already swap in a Combobox or a grid. It costs one more click for a priority or a date. The keys `1`–`4` and the row's own buttons stay the one-step paths.

### D2: The submenu stays a menu

Unlike picker and step items, which turn the panel into a dialog, a submenu keeps `role="menu"`, the roving keyboard model and the close-on-select behaviour. Its first item is a menu item named after the submenu with a back arrow, so the panel has only menu items in it. Escape and an outside tap go back first, as in a picker step. Focus moves to the first choice when the submenu opens and back to the item that opened it when it closes.

### D3: Stable group keys

`Items` keyed group wrappers by index. A group that appears after the menu's read lands (Start tracking, once the task is known) shifted every later index and remounted those groups, dropping the focused item. Groups are keyed by their first item's id, which is unique within a menu.

## Data model, size and budget

No data model change. No dependency, so no change to the image size or runtime memory. Interface budget: no chrome, task property, sidebar destination, scroll region or shortcut is added. The menu loses rows and, in the common case, its scroll region.
