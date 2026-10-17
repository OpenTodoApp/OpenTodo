# Design

## D1: Split by responsibility, keep render identity

Each screen keeps its file and export; it calls one data hook, one keyboard hook and renders bodies. Hooks receive the state setters themselves (React's stable `useState` setters), so effect dependencies are unchanged and the registrations that ran once (panel handlers, Vim list state, the open-task subscription) still run once. The large-list guarantees hold: `ListRow` stays memoized with per-row `selected`, and the row handlers are one object for the life of the list, read through a ref (`listPerformance.test.tsx` still counts at most two row renders per `j`/`k`). Effects keep their order (the route reset before the open-task subscription; a task change resets the property editors before the focus signals reveal one).

## D2: Pure grouping in `lib`

`listGroups(input)` takes the view, its tasks, the tree, Later tasks, collapse state and maps, and returns the groups the list renders; it is the former memo body without React. The heading strings are translated with `t()` as before. `tasksForView` is the former `viewTasks` switch, `sectionBuckets`/`boardColumns` the section and board memos, `siblingPositions` the aria-posinset/setsize map (assistive-tech-semantics). The calendar's day data (`calendarDays`, `calendarOrder`) follows the same pattern.

## D3: Live reads as hooks in `lib/liveData.ts`

The direct Dexie queries of the four screens move unchanged into named hooks. Defaults are module constants instead of fresh `[]` per render, so memos over them no longer recompute before the first result (no visible change). The list's separate `boardMode` query is the same `loadViewMode` read as `viewMode` and is now derived from it. The assistant's thread types are re-exported from `lib/assistant` so the panel does not import `lib/db` for types either.

## D4: The size limit

ESLint's core `max-lines-per-function` counts raw lines (comments and blank lines included, so the numbers match an editor). 250 is generous: after the split no function in the four screens is above 190. The allow-list is a per-file override with a ceiling about 3 to 5 % above the size when the limit came in, so small fixes from parallel work still merge while growth fails; each entry names the function and why it is long. Tests, stories and test kits are exempt.

**Size**: no new dependency (the rule is in ESLint core). Bundle: the split moves code between modules of the same chunks; the production build size is reported in tasks.md.
