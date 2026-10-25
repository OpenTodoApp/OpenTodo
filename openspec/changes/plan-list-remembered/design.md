# Design

## D1. On the device, like the list's source

The source of the planning list is already kept in local storage; whether it is open joins it under `opentodo.calendarPlan.open`. It is a layout choice that differs between a desk and a phone, like the side panel's width, so it does not sync.

## D2. Only the user's own open and close count

The slot also empties when a task opens from the Calendar or the user leaves for another page. Those are not choices about the list, so only the menu item, the list's close button and Escape write the remembered state. `PanelFrame` takes an optional `onClose`, used by its Close and Escape, so the planning list can record it before emptying the slot.

## D3. Restored on arrival, wide screens only

`usePlanPanel` (shared by Day, Week, Month and Plan) opens the list on mount when it is remembered open, the screen is at least 1024 px (the split query) and the slot is empty, so a task in the address or an open list is never replaced. Moving between Calendar views keeps the list open as before, so the restore is a no-op there. Below 1024 px the list is a sheet over the grid and would hide it, so it waits for the menu.
