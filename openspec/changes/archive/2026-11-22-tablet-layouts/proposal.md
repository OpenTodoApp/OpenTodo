# Tablets: layouts for tablet widths, landscape and split windows

Part of the umbrella change `mobile-native-feel` (read its design for the order and the measure of success).

## Why

The app has three panes only from 1024 px (sidebar, list and the docked task panel, `web-app` "side panel"); below that the panel is an overlay and below 768 px the sidebar is a drawer (Tailwind `md`/`lg`, `Sidebar.tsx:178`). An iPad in portrait (744-834 px), a split-view half (about 500-700 px), Stage Manager windows of any size and Android tablets and foldables fall between these. `tablet-header-room` (1.5.0) made headers follow their own width, but the page layout still follows the window. The layout check runs at 360, 390 and 768 px only.

## What Changes

- First, an audit task: every screen at 744, 820, 1024, 1180 and 1366 px, portrait and landscape, and at split-view and Stage Manager sizes (320, 507, 678, 981 px wide), with a findings list in this change's design before any layout code.
- Layouts follow the space the shell has: from 900 px the task panel docks beside the list (instead of 1024), and the sidebar folds while the list would keep less than 25rem; from 600 px a task opens as a sheet over the list; below 768 px the tab bar and drawer stay as they are; Notes and Calendar get the same three-pane rule.
- The layout check gains tablet widths and a landscape height for each.

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- Pointer, keyboard and window behaviour in the shells (change `tablet-shells`).
- New tablet-only features.

ROADMAP.md: "Shells that feel native" (the mobile track after 1.6.0).

## Capabilities

### Modified Capabilities

- `web-app`: pane rules follow the available width with tablet steps.
