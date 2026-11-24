# Design: sort-projects-by-name

## D1. A one-time sort, not a mode

The sort rewrites `position` once (`lib/move.ts` `planSortProjects`, `lib/ordering.ts` `planSortByName`), in one `mutateMany` batch through `applyBatch`, so Undo restores the order in one step. A lasting "sort by name" mode would need a new synced setting, a rule for where new and moved projects land on every device, and a way out when someone drags; none of that is needed for the request.

## D2. The places stay, the order changes

The projects the user may move take the positions the group already holds, in name order. A shared project the user may not move (project-sharing roles) keeps its position, so the others sort around it and it is never written. Only positions that change are written. When positions are equal (concurrent inserts), they are renumbered `GAP` apart, if every project in the group may be moved; otherwise nothing is written.

## D3. Name order

`Intl.Collator(language, { numeric: true, sensitivity: 'base' })` on the trimmed name: numbers by value, case and accents ignored, the app's language. Equal names keep their current order.

## D4. Moves follow the shown list

`projectContext` reads the current workspace's projects (`projectsIn`), as the sidebar and the All projects page do, so Move up, Move down, drag and the sort never count a project of another workspace. On the All projects page the table handles Alt+Up and Alt+Down like the sidebar and refocuses the moved row; while a header sorts the table the rows are not movable.

Data model: none (the existing `position` field). Bundle: no dependency. Interface budget: two menu items, no new chrome, no new shortcut.
