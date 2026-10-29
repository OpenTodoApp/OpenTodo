# Tasks

## 1. Submenu item

- [x] 1.1 Add the `submenu` item kind to `ActionMenu` (`web/src/app/menus/ActionMenu.tsx`): the swap in the same menu, a back item, Escape and an outside tap going back, focus onto the first choice and back onto the item; `flatItems` for callers that need every leaf; verify `npm test -- ActionMenu bulk`
- [x] 1.2 Key menu groups by their first item instead of their index, so a group that appears after the menu's read does not remount the others; verified by the focus assertion in `bulk.test.tsx` ("Priority and Date are one item each"), which failed intermittently before
- [x] 1.3 List submenu choices in the command palette through `flatItems` (`web/src/app/palette/registry.ts`); verify `npm test -- palette`

## 2. Task Actions menu

- [x] 2.1 Fold Priority and Date into submenus in `bulkMenuGroups` (`web/src/app/bulk/BulkActions.tsx`), still left out beside a row's More button; verify `npm test -- bulk`
- [x] 2.2 Update the bulk tests that picked Tomorrow and Priority 1 at the top level, and add the submenu test; verify `npm test` and `npm run build` in `web/`
- [x] 2.3 Check in the built app at 1280 × 720 that the right-clicked menu fits on screen (470 px tall, down from about 16 rows) and that both submenus open and go back
