# Proposal

## Why

On a phone the icon picker is a grid of 36 px cells, eight to a row: under the 44 px a finger needs. The interface audit counts them on the new project's Appearance sheet at 360 px (GitHub issue [#1369](https://github.com/OpenTodoApp/OpenTodo/issues/1369), rule M7, 15 findings, the most the rule reports for one screen). In the same sheet the "Search icons" field runs from one edge of the screen to the other, while the sheet's title starts 16 px in.

## What Changes

- **Icons are 44 px targets on touch.** With a coarse pointer the picker's grid holds as many columns of at least 44 px as its width allows, all the same width: seven at 360 and at 390 px. The arrow keys follow the columns as drawn.
- **The colour swatches share the columns.** The palette swatches of a project, a label and a section were already 44 px targets; on touch they now stand in the same columns as the icons under them. The theme editor's colour picker shows its 18 swatches six to a row on touch (nine to a row they were 32 px at 360 px).
- **The search field keeps the sheet's inset.** In a phone's sheet the field starts and ends 16 px from the edges, in line with the sheet's title, wherever the picker opens; the icons and the swatches start 20 px in.
- **Nothing changes with a mouse**: 36 px cells in eight columns, 20 px swatches, the same panels.

Out of scope: the picker's content, search and catalogue; the command palette's icon and colour lists; what a pick stores; the icon cells that overlap with a mouse in the panels narrower than 320 px (found while measuring, see the design's open question).

Advances the ROADMAP item "Shells that feel native" (targets a finger can hit).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: a new requirement for the icon and colour pickers on touch.

## Impact

- `web/src/ui/IconPicker.tsx`: the cells, the grid, the columns the arrow keys use, the inset in a sheet, and `TOUCH_GRID`, the classes of a grid of touch targets.
- `web/src/ui/ColourField.tsx`: six swatches to a row on touch.
- `web/src/app/menus/projectAppearance.tsx` (`ColourSwatches`), `web/src/app/SidebarAppearance.tsx`, `web/src/app/WorkspaceGeneral.tsx`: the same grid and the sheet's inset.
- No data, op, route, setting or string changes. No dependency.
- The phone-width screenshots of the icon picker and of the colour swatches change.
