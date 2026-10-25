# Design: the planning list stays open across the Calendar

## Context

The panel slot remembers the path it was opened on and the shell closes it when the path changes (ux-overhaul D1: a panel belongs to the page that opened it). The Calendar's ranges are separate routes with the date in the path, so every step through the dates closed the planning list (#350). The list also called the actions of the view that rendered it, through a ref owned by that view.

## Decisions

- **D1 One page for the Calendar.** `panelPage()` in `panel.ts` maps `/day`, `/week`, `/month` and `/plan`, with or without a date, to one page key; the stale-panel check compares page keys. Other pages keep the per-path rule. Alternative considered: exempt only the planning list's key; rejected because a future Calendar occupant would hit the same bug.
- **D2 Switching range keeps the list.** The reporter asked for it across day, week and month; Day, Week, Month and Plan are one destination with one range switch, so closing on a switch would read as the same bug.
- **D3 Actions follow the view on screen.** Each Calendar view registers its planning actions while mounted (`usePlanActions`); the list calls whichever is registered, so after Day → Month a drag lands on a Month day instead of calling an unmounted Day grid.
- **D4 Month gets the planning list.** Without it, a list carried into the Month could not place anything. In Month a drop or `s` sets the date and keeps a time the task already has, like moving a task between days there.
- **D5 Phone.** Below 768 px the list is the slot's bottom sheet as before; the same rule keeps it open, and `s` places on the focused day where dragging out of the sheet is awkward.
