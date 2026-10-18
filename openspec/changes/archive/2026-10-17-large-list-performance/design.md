# Design

## D1. Memoized rows with stable handlers

`TaskRow` is wrapped in `React.memo`. `TaskListView` renders a memoized `ListRow` per task that receives only primitives (`selected` is a boolean, not the selected id), objects that are stable while their source is unchanged (the task, its project, progress and habit entries from the list's maps, the label map) and one `actions` object created once per list, whose methods read the latest state through a ref. Labels are resolved inside the row (memoized on the task's label ids). A cursor move therefore changes the props of two rows. A write still re-renders the rows it reaches, because Dexie returns new task objects; that is in proportion to the write.

## D2. One live snapshot of the visible tasks

`lib/liveTasks.ts` holds one Dexie `liveQuery(visibleTasks)` while at least one component subscribes (through `useSyncExternalStore`), and drops it with the last subscriber. Selectors (`openTasksOf`, `openCountsByProject`) are cached per snapshot in a `WeakMap`, so the sidebar, sub-projects and labels share the same open list. The snapshot is shared, so callers must not mutate it; under test it is frozen (array, tasks, their `labels` and `due`), and the whole suite passes with it frozen. When tests swap the database (`useDatabase`) the store restarts on the next subscription. Offline and convergence are unchanged: the snapshot is a read of IndexedDB like the queries it replaces, refreshed on every local or synced write.

The same pattern already served comment and attachment counts (`useCommentCounts.ts`); the membership map for rows (UI-6) joins it there, read only while encryption is on.

## D3. No windowing

After D1 a cursor move renders two rows (measured: 1, 2, 2, 2 renders for four presses). Windowing would remove rows from the DOM, which `scrollIntoView` on the selected row, drop-zone lookup by `data-task-id`, `aria` list semantics, the browser's find and the layout check rely on. The cost it would remove is the first render of a very large list, which this change does not address.

## D4. Incremental re-write job

`pending(entity, mode, after, me, limit)` reads `where(':id').above(after).limit(page)` pages in primary-key order (the order the job already used, IndexedDB string order) until it has `limit` rows that need a re-write. A batch reads pages of its own size (200); counting the total at the start still reads each table once. Measured: 39,000 task reads for 2,000 tasks before, 10,000 after (about 5 per task, independent of table size).

## Data model, size and interface budget

No data model change, no new index (no Dexie version bump), no dependency. Bundle impact: +1.3 KB of JavaScript in total (+0.7 KB gzip), of which +0.4 KB (+0.3 KB gzip) in the entry chunk. No screen changes: no chrome, property, sidebar, scroll region or shortcut is added.
