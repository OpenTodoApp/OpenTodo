# Design

## Context

`position` is a number on tasks and projects, set to the creation time in milliseconds and synced as an LWW register; lists already sort by it. This change needs an insertion scheme, a deterministic total order, interaction (drag and keyboard), and a clear statement of what happens when two devices reorder the same list offline. Sequence CRDTs give stronger guarantees but are heavy; the question is whether per-item LWW positions are good enough. For a personal task list they are, provided the order is total and nothing can be lost.

## Goals / Non-Goals

**Goals:**
- One op per ordinary move.
- Total order identical on every device.
- Reordering inside sections and parents, and cross-container drops, with the existing fields.
- Small drag implementation shared with `board-view`.

**Non-Goals:**
- Intent-preserving merge of concurrent reorders (a sequence CRDT); interleaving is accepted.
- Per-view positions.
- New API routes.

## Decisions

### D1. Order = `(position, id)` ascending
Ids break ties so that the order is total and identical everywhere even when two items end up with the same position (possible after concurrent inserts into the same gap). This rule is documented in `docs/sync.md` and applied by every list helper.

### D2. Midpoint insertion with bounded renumbering
Move = `position = (prev + next) / 2`; before the first item `first - 1000`; after the last `last + 1000`. Positions are IEEE doubles; existing values are millisecond timestamps (about 1.7e12), leaving roughly 20 bits of fraction, so a gap can be bisected around 20 times before `prev`, `mid` and `next` stop being distinct. When `mid <= prev || mid >= next`, the client renumbers the current list (same container: project + section + parent) with spacing 1000 starting at the smallest existing position, writing one op per item, then places the moved item. Renumbering is local to one list and rare in practice.
- Alternative: string-based fractional indexing (arbitrary precision keys). Rejected: `position` is a number in the op schema; changing its type would be a breaking op change.
- Alternative: integer positions with periodic renumbering only. Rejected: every insert between neighbours would renumber.

### D3. Cross-container moves are one `mutate()` call
Dropping into another section or under another parent writes `section_id`/`parent_id` and `position` together with one timestamp. Under LWW the newer move wins both fields, so a task cannot end up with one device's container and the other's position.

### D4. Convergence story and its limit
Per-item positions under LWW guarantee: same op set → same `(position, id)` order; no loss or duplication (items are rows, order is derived). They do not guarantee intent preservation: if A moves X between P and Q while B moves Y between P and Q, both get midpoints near each other and the final relative order of X and Y is by position then id, not by anyone's intention. A concurrent renumber on A and a midpoint move on B can place B's item somewhere else than B intended once A's new spacing wins. Both outcomes are deterministic and visible, and one more move fixes them. Accepted for a personal list; a sequence CRDT could be added per list later without changing the transport, as the bootstrap design anticipated for `labels`.

### D5. Interaction
- Drag: pointer events (down, move beyond 6 px or 300 ms touch hold, up), a translated ghost, a 2 px indicator between rows computed from pointer y, Escape cancels. The same primitive lands in `lib/dnd.ts` (shared with `board-view`, whichever ships first).
- Keyboard: Alt+Up/Down for one step, Alt+Shift+Up/Down for top/bottom. Alt avoids clashes with `j`/`k` navigation and with Tab/Shift+Tab used for subtask indent.
- Only manually ordered views enable drag handles and the shortcuts; others show the help text "sorted by date".

### D6. Sidebar projects
Projects reorder among siblings (same `parent_id`) with the same helpers. Dragging a project onto another project to re-parent is offered only when `project-hierarchy` is present; otherwise only same-level reordering is possible.

## Data model impact
- No new entities or fields; `position` keeps its number type and meaning. No renames. All writes through `mutate()`; the REST `PATCH position` path is unchanged.
- Dependencies: none. Container image and runtime memory unchanged. Client bundle +3–5 KB gzipped (order helpers, drag primitive if not already present, indicators).

## Risks / Trade-offs

- [Concurrent reorders interleave] → deterministic, no loss; documented; one move fixes it (D4).
- [Renumbering writes many ops] → bounded to one list, triggered only after ~20 bisections of the same gap; sent in outbox batches.
- [Drag on touch conflicts with scrolling] → 300 ms hold before drag starts; vertical scroll otherwise.
- [Floating-point equality across platforms] → doubles are deterministic across JS engines and Go; the id tie-break covers equal values.

## Migration Plan
None. Existing positions (creation timestamps) already form a valid order. Rollback: older clients keep sorting by position.

## Open Questions
- Whether Today should get a per-day manual order later (would need a per-view position field; deferred).

## Implementation notes

Built on what `board-view` shipped: `web/src/lib/ordering.ts` (extended, not a new `order.ts`) and the library-free `web/src/lib/dnd.ts` (unchanged; its thresholds are 5 px and a 350 ms touch hold rather than the 6 px / 300 ms sketched in D5).

- **Order rule (D1).** `compareByPosition` (position, then id) replaced board-view's position → created_at → id comparison everywhere a manual list is sorted: `byPosition` is now an alias, and the generic tree (`tree.ts`) uses it for subtask and sidebar siblings. Date views use `compareDueThenPriority` (due, priority, then `(position, id)`).
- **Offsets (D2).** `positionBetween`, `positionAtEnd` and `positionAtStart` use `GAP = 1000` instead of board-view's ±1; existing tests were updated.
- **Renumbering refined (D2).** Instead of always renumbering the whole list from its smallest position, `planMove` renumbers the *smallest window* of neighbours around the gap. It starts with just the moved item. While the values do not fit (identical neighbours, adjacent doubles, or a renumbered step too small to allow about 10 more bisections), it grows the window one neighbour at a time towards the side with fewer window items; an open list end spaces by 1000. The worst case is the whole list, as designed; typical cases are 2–3 ops. This also resolves board-view's integrator note: identical positions no longer block a move between them, and `reorderSection` now uses `planStep`. Items the caller marks as not writable (shared projects where the user is not owner/admin) are never rewritten and bound the window; if both sides are blocked the move is refused (no op).
- **Moves (D3).** `web/src/lib/move.ts`: `moveTask(id, {parent_id, section_id?, at})`, `moveTaskBy(id, step)`, `moveProjectTo`, `moveProjectBy`, and the `moveItem` entry point named in the tasks. Each reads the target list (open tasks built into the same tree the view renders; top-level lists split by effective section), plans with `planMove` / `planStep`, and writes container fields plus every position in one `mutateMany()` call. Refused without writing: viewers, completed tasks, a parent that is the task or a descendant (raw pointers over all live project tasks), deleted sections, unknown anchors.
- **New tasks** are appended at the end: `createTask` uses the creation time, or the largest position anywhere + 1000 when a moved item already sits past "now" (one indexed read on `tasks.position`).
- **Drag UI (D5).** Task rows in project lists, board columns and the Inbox are `data-drop-target="task:<id>"`. `app/listDrop.ts` maps the pointer to a zone: the top or bottom quarter places the item before or after the row, and the middle nests it as the last subtask (board cards use halves and do not nest). Dropping just below an expanded parent makes the item its first child, which is where the indicator line sits. Section headings and board columns keep board-view's drop-at-end behaviour (a dropped subtask becomes top-level at the end of that section). A drag never targets its own subtree. Sidebar project rows work the same way, and their middle zone re-parents (project-hierarchy has shipped, so D6's condition holds).
- **Keyboard.** Alt+Up/Down and Alt+Shift+Up/Down act on the selected task (list and board) or the focused sidebar project. They are ignored while typing, behind dialogs, in non-manual views and for viewers. If a mouse click left a sidebar project focused, pressing j/k to select a task takes focus off it, so the next Alt+arrow moves the task rather than the project (found in the browser smoke).
- **Roles.** Task and section positions follow `canEditTasks` (editors and up); project positions follow `canEditProject` (owner/admin), matching the server's `CanWrite` table, so no op is queued that the server would refuse.
- **No server change.** No migration, no Dexie version bump, no new routes, no dependencies.

### Size impact (measured)

`npm run build`, main chunk: 762.63 kB → 770.72 kB minified (+8.1 kB), **223.99 kB → 226.87 kB gzipped (+2.9 kB)**; CSS 53.28 kB → 53.35 kB. Under the 5 KB budget. Go binary and container image unchanged apart from the embedded assets.
