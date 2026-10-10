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
