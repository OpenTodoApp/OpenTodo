 # Design: tablet-layouts

 ## D1. Audit first

 Task 1 records, per screen and size, what breaks (overlap, wasted width, a panel covering the list, a header in phone mode on a wide window). The pane rules below are a starting point that the audit confirms or changes; the design is updated before task 2.

 ## D2. Pane rules by available width

 Measured on the app frame (`ResizeObserver`, as `useHeaderRoom` does for headers), not media queries, so split view and Stage Manager get the right layout at any size:
 - under 600 px: phone rules (drawer, overlay panel, bottom bar);
 - 600-899 px: sidebar as icons (expands over the list), panel as an overlay sheet from the end edge;
 - 900 px and up, list at least 22rem: three panes, panel docked.
 The existing `--panel-w` clamp keeps its upper bounds.

 ## D3. Orientation

 No layout depends on orientation itself, only on width; turning an iPad re-measures. Scroll position and the open task survive the change (tested).

 ## D4. Tests

 `scripts/e2e-layout.mjs` WIDTHS gains 744, 1024 and 1180 with landscape heights; the audit's findings each become a layout check assertion.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: about 1-2 KB gzip, in the shell layout code; lazy where possible. The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): tablet layouts must keep at most 2 rows of chrome above a list's first item and at most 3 vertical scroll regions (sidebar, list, panel), which the layout check asserts at each tablet width.
