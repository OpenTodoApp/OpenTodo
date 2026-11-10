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

## Implementation notes

- **Dropping items.** The write tools can add to and change items of the open proposal but cannot remove one, so a turn with an open proposal also offers `drop_from_proposal` (`ids`), an in-app tool of `internal/assistant` (never in the registry or MCP), on the server and the device (the manifest's `open_proposal`).
- **The model sees the proposal.** The fixed instructions end with the open proposal: a note, then one compact JSON line per item (entity, id, `new`, its values in field order). The same text on the device is pinned by `prompt.vectors.json`.
- **Checks.** `agenttools.Registry.OpenProposal` keeps an item when its entity is one the write tools plan (task, project, section, label, comment, reminder, note), every patch and base value passes `sync.Validate`, a change names an entity the person can see and has not kept away, and a new item's id names nothing visible. Others are left out silently, as a planner would leave out an unknown id. The device's twin (`assistantDevice/open.ts`, `open.vectors.json`) checks the entity, the visibility and the field names; the value kinds only on the server.
- **What the client sends.** Every item of the open card, unchecked ones included; their checkboxes and edited marks come back for items the turn left as they were. Not with Regenerate or Edit question, which replace the answer the proposal came with. A turn that fails or ends without a change set leaves the open proposal on the card. An amended proposal is never applied automatically.
- **Marks.** An item the turn added reads **added**, one whose values it changed **changed**; an item it removed is named in a line above the items.
- **Time.** The editor gains a Time field for an item with a do-on date (empty is any time): the "small time menu" of D1 is that field, opened from the pencil, also in the calendar.
- **Moves.** A drag lands on a day of the calendar (`calendarDrag.ts`'s lane target on each agenda day); Alt+↑/↓ (and ←/→) move the focused item a day, announced politely. The calendar stays a calendar while it is edited, even past seven days.
- **Bundle.** The editor loads with the first edit and the amend logic (`lib/assistantAmend.ts`) with the panel; the first load stays at 693.9 KB, within its budget.
