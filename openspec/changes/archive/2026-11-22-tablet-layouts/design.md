 # Design: tablet-layouts

 ## D1. Audit first

 Task 1 records, per screen and size, what breaks (overlap, wasted width, a panel covering the list, a header in phone mode on a wide window). The pane rules below are a starting point that the audit confirms or changes; the design is updated before task 2.

 
### Findings (task 1.1, 22 Nov 2026)

Measured with the interface tour (`scripts/ux-audit/tour.mjs`, its seeded account) on 15 screens at 507, 678, 744, 820, 981, 1024, 1180 and 1366 px (touch below 1280 px). The pane widths come from a probe on the Inbox with a task opened. Heights: 900 px, or the device's landscape height.

| Width | Sidebar | Task opened from the list | List width with the task open |
| --- | --- | --- | --- |
| 507, 678, 744 | drawer, bottom tab bar | full page | none |
| 820 | docked, 256 px | full page, the list gone | none (490 px before) |
| 981 | docked, 256 px | full page, 700 px of empty property rows | none (651 px before) |
| 1024 | docked, 256 px | docked panel | 278 px (17.4rem): titles wrap to three lines |
| 1180 | docked, 256 px | docked panel | 354 px (22.1rem) |
| 1366 | docked, 256 px | docked panel | 462 px |

- **F1. iPad mini portrait (744 px) gets the phone layout.** The sidebar docks only from 768 px, so a 744 px window shows the bottom tab bar and the floating add button.
- **F2. From 768 to 1023 px an opened task replaces the list.** There is room for both. At 981 px the task page stretches its property rows across 700 px.
- **F3. At 1024 px the docked panel squeezes the list to 278 px.** The 256 px sidebar stays while a task is docked.
- **F4. Touch targets at 1024 and 1180 px.** On a touch screen, Settings' navigation links are 30 px tall and the "Settings" back link 20 px. Both are below the 44 px the touch rule asks.
- **F5. The board has four scroll regions from 981 px** (the budget is three): the board scrolls inside the list page.
- **F6. Layout shift at 820 px:** a project's section cards move after the first frame (CLS 0.21; the limit is 0.1). The same happens on the board and, at 507 px, on the Timeline.
- **F7. Calendar and Notes** follow the same sidebar rule and need no third pane of their own. Week shows five days from 820 px. Notes opens a note full page below 1024 px, as tasks do.

## D2. Pane rules by available width

Updated from the findings (task 1.2). Measured on the app frame (`ResizeObserver`, as `useHeaderRoom` does for headers), not media queries, so split view and Stage Manager get the right layout at any size:
- **under 600 px:** phone rules (drawer, overlay panel, bottom bar), as today.
- **600-899 px:** an opened task is an overlay sheet from the end edge, with the list kept behind it (F1, F2). The navigation does not change: below 768 px the bottom tab bar and the drawer stay, and from 768 px the sidebar and its rail and fold rules apply as today. Amended during the work: an icon rail in place of the tab bar from 600 px would change navigation on large phones in landscape and small tablets, and every phone rule (the add button, the bar's hiding, the interface budget) with it, for little gain on the screens the audit found wanting.
- **900 px and up:** the task panel docks. When the list would fall under 25rem (`LIST_ROOM_REM`), the sidebar folds to icons while a task is docked, and comes back when it closes (F2, F3). At 1024 px that gives the list about 470 px instead of 278. Without a docked task the sidebar keeps its width.
- Notes and Calendar follow the same 900 px rule (`SPLIT_QUERY`).
- The existing `--panel-w` clamp keeps its upper bounds.

**Fixed in the same change:** F4 (`touch-target` makes Settings' navigation 44 px tall on a coarse pointer at every width) and F6 (the section cards reserve their height). F5 (the board's own scroll region) gets its own small change, because it is the board's layout, not the panes'.

## D3. Orientation

 No layout depends on orientation itself, only on width; turning an iPad re-measures. Scroll position and the open task survive the change (tested).

 ## D4. Tests

 `scripts/e2e-layout.mjs` WIDTHS gains 744, 1024 and 1180 with landscape heights; the audit's findings each become a layout check assertion.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: about 1-2 KB gzip, in the shell layout code; lazy where possible. The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): tablet layouts must keep at most 2 rows of chrome above a list's first item and at most 3 vertical scroll regions (sidebar, list, panel), which the layout check asserts at each tablet width.
