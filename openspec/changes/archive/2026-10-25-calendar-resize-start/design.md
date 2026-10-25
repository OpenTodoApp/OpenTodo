# Design: change a block's start from its upper edge

## Decisions

- **D1 The end is the anchor.** The upper edge computes the new start from the pointer, rounded to the 15-minute grid, and the estimate as end minus start. The end is the block's start plus its estimate (or the drawn 30 minutes without one), not the end as drawn: a block that runs past midnight keeps its real length instead of being cut at 24:00.
- **D2 Bounds.** At least one slot long (start at most end minus 15 minutes and never after 23:45), never before 00:00, and never longer than the longest estimate. Moving the start across days is the move gesture's job, not the edge's.
- **D3 One change with Undo.** The due time and the estimate go in one undoable batch (`rescheduleUndoable`, label "Rescheduled", already translated), so one Undo restores both. The lower edge keeps its plain estimate edit as before.
- **D4 Same hit zone on both edges.** The top `min(7 px, a third of the block)` starts a start-resize, the bottom the same for the end, the rest moves the block. On touch the long press that lifts a drag applies to every zone, so the top edge works on a tablet as the bottom one does. Very short blocks (15 minutes, 12 px) keep a middle third to move by.
- **D5 Keyboard.** `Alt`+`Shift`+`↑`/`↓` is the twin of `Shift`+`↑`/`↓` for the other edge, in the calendar scope only (the list scope's `Alt`+`Shift`+arrows, move to top/bottom, are not active on the calendar). Like the other keyboard edits on the grid it writes through the queued edit, both fields in one operation.
- **D6 Zones.** The new start is turned into the stored due with `dueFromView`, so a due fixed to a zone keeps its zone and the stored time is that zone's wall time.
