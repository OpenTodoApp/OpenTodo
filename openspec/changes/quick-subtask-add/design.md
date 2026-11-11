# Design

## Context

A list's rows are `ListRow`s built by `listGroups` (`web/src/lib/listGroups.ts`) from each group's task tree: `task`, `depth`, `parent`, `hasChildren`, `collapsed`, `breadcrumb`. `keepGroups` keeps a row object when `sameRow` says it did not change, and `useRowRenderer` (`ListGroups.tsx`) keeps a row's rendered element across renders while the row and its context fields are unchanged — this is what keeps a 2,000-row list cheap. The "add under this task" input already exists as `SubtaskInput` (`TaskListRow.tsx`): `a` and the row menu open it right under a parent's row through the `addingUnder` state, and it writes `createSubtask` and stays for the next entry.

## Goals / Non-Goals

**Goals:** one click — or none, once the line is open — to add a subtask where the subtasks are already on screen.

**Non-Goals:** flat views, boards, the `a` shortcut's behaviour in flat views (reported under #1191), a first-subtask path from the line (a childless task shows no subtask list, so no line).

## Decisions

### D1: The row knows which parents end after it

`listGroups` marks each row with the parents whose visible subtree it ends: after each group's rows are flattened, one pass walks every row's `parent` chain and collects the ancestors deeper than or equal to the next row's depth, so the mark lives where the rendering happens and survives every list shape that produces depth and parent (project and Inbox trees, sectioned and grouped project lists, Later, nested Today and Upcoming). Flat groups produce no marks for free — their rows have `parent: null`. The mark is a new `ListRow` field `subtaskAdds` (the ending parents with their depths, innermost first) folded into `sameRow`, so `keepGroups` gives a row a new object when its marks change — a subtask added under a parent moves the line from the old last row to the new one without a stale line staying behind.

*Alternative:* look the ends up at render time from the next row's depth. The row elements are cached by row identity (`useRowRenderer`), and a row kept while a sibling is added under its parent would keep its old element — with or without the line — wrongly. Marks in the row make the cache correct by construction.

### D2: The line is a ghost until used

`SubtaskAddLine` renders a muted "+ Add a subtask" row at child indent — a real button, so it is reachable by Tab — and swaps to `SubtaskInput` on click. `SubtaskInput`'s existing close rules (Escape, empty blur) hand the ghost back. Local state per line; no new UI state in the list model, and `j`/`k`, the `a` line and `addingBelow` are untouched.

### D3: The same gates as the row menu

The line renders only for a parent that is writable in this list — not completed, not read-only — matching the menu's "a task that cannot move gets no Add subtask" (a viewer sees no line either way). Marks are filtered at render with `c.isReadOnly`, so a membership change flips the lines with the rows. Completed parents lose their line the same way. Departing rows keep their marks and leave with their ghost, like every other row element.

## Data model, size and budget

No op-schema or data change: the line writes `createSubtask` ops like the other ways to add; offline and convergence are inherited. No dependency; the mark pass is O(rows × depth) inside the existing group build, and the render adds a handful of elements per visible parent. Interface budget (`docs/interface-guide.md`): no chrome rows, no new property, destination, scroll region or shortcut — the line is list content that only appears where a subtask list already shows.

## Risks / Trade-offs

- [A line under every expanded parent is chrome] → muted and only where a subtask list already exists; childless and folded parents show nothing, so a flat list reads unchanged.
- [A departing parent's line flashes during its exit animation] → accepted: the marks follow the kept rows, and the line leaves with the ghost.
