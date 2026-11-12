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

### D2: The line shows for the selected parent and under the pointer

A line under every expanded parent adds a row and a Tab stop to every list — more than the "calm list" bar allows (review). The marks render in one hidden `<li>` per ending row instead: a line shows when its parent is the selected row (the row under the keyboard cursor or last clicked), and hovering the subtree's last row or the stack itself reveals it (`index.css`, `@media (hover: hover)`), the way the rows' own revealed actions are CSS, not hover state. `SubtaskAddLine` renders the muted "+ Add a subtask" row — a real button, so it is reachable by Tab while it shows — and swaps to `SubtaskInput` on click; Escape hands the ghost back with its button focused, an empty blur hands it back without touching focus. `subtaskAddOpen` holds the one open line (a `a`/`addingBelow` line still closes it), and it clears when the parent's marks leave the rows, so a fold does not bring the input back on unfold.

*Alternative:* a hovered-row field in the row context. Rows reveal on `group-hover` precisely so a pointer move never re-renders the list; a field would redraw on every row hover.

### D3: The same gates as the row menu

The line renders only for a parent that is writable in this list — not completed, not read-only — matching the menu's "a task that cannot move gets no Add subtask" (a viewer sees no line either way). Marks are filtered at render with `c.isReadOnly`, so a membership change flips the lines with the rows. Completed parents lose their line the same way. A departing row's marks do not draw (`!ghost`), so completing the last subtask never doubles the parent's line, and no lines draw while a drag runs (`!draggingId`), so drop zones stay one-line rows (row-expand D4). The muted line is laid out like a row — the "+" in the child's checkbox slot and the label at the title column, time column included — so it reads as the subtask to be added.

## Data model, size and budget

No op-schema or data change: the line writes `createSubtask` ops like the other ways to add; offline and convergence are inherited. No dependency; the mark pass is O(rows × depth) inside the existing group build, and the render adds a handful of elements per visible parent. Interface budget (`docs/interface-guide.md`): no chrome rows, no new property, destination, scroll region or shortcut — the line is list content that only appears where a subtask list already shows.

## Risks / Trade-offs

- [A line under every expanded parent is chrome] → shown for the selected parent and under the pointer only (D2), and only where a subtask list already exists; childless, folded and flat lists read unchanged.
- [A departing parent's line flashes during its exit animation] → the marks follow the kept rows, but a ghost's marks do not draw, so the parent's line stays single while the row leaves.
- [A cursor move redraws the rows whose lines turn on or off] → the mark names the parent but lives on the ending row: `subtaskAddEnds` (parent → ending row, from `useAddLines`) lets `mayChange` add those rows to its set, so a cursor move still compares two lookups per row.
