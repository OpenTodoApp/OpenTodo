# Design

## Context

GitHub issue 1369, seen at 360 px in the interface audit. Measured on the built app in Chromium with touch, before this change:

- **The icon cells.** `IconPicker` (`web/src/ui/IconPicker.tsx`) draws each icon as a `div` of `h-9 w-9` in `grid grid-cols-8 gap-0.5`: 36 × 36 px at every width and pointer, 44.3 px apart at 360 px. No two overlap; they are just small.
- **The search field.** Its box is 0 to 360 px: the whole sheet, flush on both sides (the left end hides under the sheet's rounded corner, so it reads as a missing right margin). Nothing is wider than its container: the sheet's `scrollWidth` equals its `clientWidth` (360), and so does the page's. The cause is that nobody owns the inset. A phone sheet's content area has no padding of its own (`Popover`, `className=""`), a menu brings `p-1`, the swatches bring `px-1.5` and the icon list `p-1`; the field has none, and in the new project's Appearance popover (`SidebarAppearance`) it has no padded parent either. The sheet's title starts at 16 px.
- **The palette swatches** (`ColourSwatches`, `web/src/app/menus/projectAppearance.tsx`) are `touch-target` buttons in a wrapping flex row: 44 × 44 px, 4 px apart, no overlap, seven to a row from 6 px. They pass; their columns are not the icons' columns.
- **The theme editor's colour picker** (`ColourPicker`, `web/src/ui/ColourField.tsx`) draws 18 swatches in `grid-cols-9 gap-1.5`: 32 px squares in a 360 px sheet.
- **With a mouse** at 1280 px the new project's panel is 320 px: 36 px cells from 21 to 330 px, 20 px swatches from 23 px.
- The picker opens in a popover (new project, new label: swatches only), in a menu's step (project, section, saved view) and in a menu (`WorkspaceGeneral`). `touch-sheet-focus` keeps its field unfocused on touch (`pickerField()`, `restInOverlay`).

## Goals / Non-Goals

**Goals:** 44 px targets without overlap for icons and swatches on touch; one rhythm in a sheet; the field inside the sheet's inset; the shared components carry the rule; a mouse sees no change.

**Non-Goals:** a new picker layout, larger glyphs, changes to the panels with a mouse.

## Decisions

### D1. A grid of touch targets: as many 44 px columns as fit

On a coarse pointer the icon grid's columns are `repeat(auto-fill, minmax(44px, 1fr))` with a 2 px gap, and a cell is `touch-target` (44 px minimum both ways) with its width left to the column. The classes are one constant, `TOUCH_GRID`, exported from `web/src/ui`; `ColourSwatches` uses the same constant, so swatches above an icon grid stand in its columns. At 360 px that is seven columns of exactly 44 px (20 to 340 px), at 390 px seven of 48.3 px; eight would need 366 px.

The breakpoint is the pointer, as for `touch-target` and the 44 px rows: a narrow window with a mouse keeps 36 px cells.

Rejected:
- A fixed `grid-cols-7` on touch: right at 360 px, wrong on a tablet's 320 px panel (six fit) and in any other width.
- 44 px cells in the eight columns: at 360 px they overlap by 4 px.
- A `@utility touch-grid` in `index.css`: Tailwind orders it before `grid-cols-8` and `flex`, so it lost to the classes it had to replace (measured: eight overlapping columns). Variant classes come after them.

### D2. The arrow keys read the columns that were drawn

The picker computed rows from a constant of 8. It now reads the number of tracks from the first grid's computed `grid-template-columns` when the icons are first drawn and when the list resizes, and falls back to 8 where the browser reports none (tests, a hidden picker). Left and Right were already in drawing order.

### D3. In a sheet, content keeps a 16 px line

In a phone sheet (`[data-overlay=sheet]`, the one element `Popover` draws below 640 px) the picker pads itself by 8 px (`in-data-[overlay=sheet]:px-2`), and the palette swatches by 12 px. A parent that puts content bare into a sheet adds the 8 px a menu has: `SidebarAppearance` (its popover had no padding) and the workspace's icon menu (4 px, now 8 in a sheet). Result everywhere: field 16 to 344 px at 360 px, icons and swatches 20 to 340 px, the title at 16 px.

The condition is the sheet, not the pointer: the missing margin is the sheet's, and the anchored panels keep their edges, so a mouse sees no change.

Rejected: padding on every sheet's content area in `Popover` (it would move every menu and list in the app); a width on the field (nothing was too wide).

### D4. The theme editor's swatches: six to a row on touch

`pointer-coarse:grid-cols-6`: 51 px squares in a 360 px sheet, 44.3 px in a tablet's 320 px panel, three rows of six. Nine to a row with a mouse, as before.

## Risks / Trade-offs

- One row of icons fewer per screen on a phone (seven columns, 46 px rows instead of 38 px): about 42 icons in the list's 288 px instead of 56. Search is the way to an icon; the list scrolls.
- The palette swatches gain 2 px gaps instead of 4 px on touch, to share the icons' columns. Each is still its own 44 px target and the dots are 20 px, 26 px apart.

## Data model, size and interface budget

- No data model impact: no field, op, route or setting; a pick writes what it wrote.
- No dependency; the container image and runtime memory are unchanged. The first load grows by a few class names (measured in the tasks).
- Interface budget (`docs/interface-guide.md`): no chrome row, task property, sidebar destination, scroll region or shortcut is added. The picker keeps its one scroll region.

## Open Questions

- With a mouse, in the panels narrower than 320 px the 36 px cells overlap: by 3 px in the project menu's Icon step (288 px panel) and by 10 px in the workspace's icon menu (224 px panel), where the last column also leaves the panel. It predates this change and is left alone here because nothing may change with a mouse; the same auto-fill rule with a 36 px minimum would fix it.
