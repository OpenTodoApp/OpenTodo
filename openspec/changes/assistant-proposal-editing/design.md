# Design

## Decisions

### D1. Drag reuses the calendar

The calendar shape's agenda rows become drag sources onto the day headings, using `calendarDrag.ts` gestures and the keyboard move (Alt+arrows), as the calendar does. A drop calls `editReviewItem` with the new date. Times are set in a small time menu, not by dragging.

### D2. Edits in every shape

The shapes reuse `ItemEditor` from the list, opened from each item's pencil.

### D3. Open proposal round-trip

`TurnRequest` gains `open_proposal: ProposedChange[]` (at most 50). The server seeds the loop's draft with it, after checking every item: entity visible, fields in the write schema. Write tools plan on top of it. The final change set is the merge. The client marks items whose patch differs from the sent version as changed this turn.

The device loop does the same. `foldUntrusted` doesn't apply: proposals are structured data, not text.

## Data model, size, interface budget

- **Data:** none (proposals are not stored on the server).
- **Size:** small.
- **Interface budget:** the before-and-after switch sits in the card head, next to the shape switch.

## Risks / Trade-offs

- **A stale open proposal.** Items are re-checked at the route, and "changed since proposed" still applies on the device.
