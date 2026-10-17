## Why

In a project picker the recent picks are offered as a "Recent" group above the project tree. With only a few projects (issue #136: four projects, three picked in earlier imports), the same projects then appear twice in a short list, and the tree below has no heading, so it reads as duplicate entries.

## What Changes

- A tree picker (projects) with fewer than 12 entries shows the tree once, in its own order, with no "Recent" group.
- A longer tree still offers up to five recent picks under "Recent", and the tree below is headed "All".

## Impact

`web/src/ui/Combobox/useCombobox.ts` (shared by every project picker: import target, move, parent and section pickers). No data or API change; no new strings ("Recent" and "All" already exist).
