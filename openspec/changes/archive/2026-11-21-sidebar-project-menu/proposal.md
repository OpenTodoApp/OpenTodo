# Proposal

## Why

A project's menu in the sidebar offered only part of the project header's menu (rename, icon, colour, pin, the moves, the flow), and a right-click on a sidebar row opened the browser's menu. Someone coming from Things 3 looks for the whole menu where the project is listed (GitHub issue [#1663](https://github.com/OpenTodoApp/OpenTodo/issues/1663)).

## What Changes

- A project's menu in the sidebar (the Projects tree and Favourites) is the project header's menu: the same items, handlers and dialogs (Duplicate, Save as template, Fields, Move to, Archive, Delete, Activity, History, Routines, Display mode, the assistant's What's next, the colours), plus Move up and Move down for the row. Archiving or deleting from the sidebar goes to the Inbox only when that project is on screen.
- A right-click on a sidebar row with a menu opens that menu and keeps the browser's away, except in a text field or over selected text; a touch right-click is left to the touch hold.
- The All projects page keeps its short row menu.

## Design

- **D1 — One menu.** `useProjectMenu` (web/src/app/menus) builds the whole menu, its dialogs and the colour swatches; `ProjectHeader` and the sidebar's `ProjectRowMenu` both call it. The page adds its own items (Show completed tasks, Print…) and its layout's groups. `projectMenuGroups` and `moveTargets` move to `menus/projectMenu.tsx`, re-exported by `ProjectHeader`.
- **D2 — Cheap until open.** A sidebar row passes `active` only while its menu is open, so the move targets, the connections probe and the review cadence load for the menu someone opened, not for every row.
- **D3 — Right-click.** One `contextmenu` handler on the sidebar's scroller, beside the touch hold, presses the row's own menu button, so it opens the same menu the button does.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-organization`: a new requirement, "The sidebar's project menu".

## Impact

- Web only. No new strings, data, op or API. `ProjectHeader`, `ProjectRowMenu`, `Sidebar`, `rowMenuHold`; tests updated where they named the short menu.
