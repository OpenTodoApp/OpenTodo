# Design

## Context

A card's drag is `beginDrag` of `web/src/lib/dnd.ts`, started by `useListDrag`. Since `drag-edge-scroll`, a lifted drag scrolls the main content or the sidebar up and down while the pointer rests near its top or bottom edge (`edgeScroller`, one step per frame). The board is a row of columns that scrolls sideways (`[data-board]`), with `scroll-snap-type: x mandatory` below 768 px, and each column's list of cards scrolls on its own. Neither was a scroller the drag knew.

Checked in Chromium at 390 × 844 with touch before any change:

- A card held at the right edge for six seconds: the board did not move.
- A fresh load of a board whose "No section" column has a task: the first frame showed three columns with "Planning" first, the next frame four with "No section" in front, and the board stayed snapped to "Planning".
- A hold on a card opened the actions sheet with "Move to section…", which listed the four columns.
- A tap on a card opened `/task/<id>`. The card's circle measured 44 × 44 px.

## Decisions

**D1. A scroller asks for edge scrolling with `data-edge-scroll`.** `"x"` on the board's row of columns, `"y"` on a column's list of cards. `lib/dnd` still knows nothing about boards. A scroller without the mark (the timeline, the calendar grid, a table) does not move during a drag, so no other drag changes. The `"y"` scrollers join the list `edgeScroller` already reads, with the same rules: the innermost one that can still move wins, never one in an inert region or under a dialog.

**D2. Sideways, a snapping scroller turns one column at a time.** `sideScroller(x, y)` finds the marked scroller whose box holds the pointer and whose left or right edge the pointer is within 32 px of (a quarter of the width for a narrow scroller), when it can still move that way. 32 px, not the 48 px used up and down: on a phone the next column's visible edge is 35 px wide, and a card held by its left part should not turn the board.

- Where the scroller snaps (`scroll-snap-type` on x, mandatory), a step per frame would be undone by the snap, and a steady scroll would pass a column in a third of a second. So the pointer first rests at the edge for 300 ms (`PAGE_ARM`), then the scroller moves to the neighbouring snap point (`nextSnap`, from the children that declare a snap alignment), and again every 700 ms (`PAGE_DWELL`) while the pointer stays. A release within 300 ms drops on the column edge under the pointer, as it did before. The move is smooth, or instant with reduced motion.
- Where it does not snap (from 768 px), it scrolls by `edgeStep` each frame, faster nearer the edge, as the list does up and down.

Both run in the frame loop `drag-edge-scroll` added, which re-reads the drop target under the pointer after every step and keeps doing so for the 700 ms after a column turn, so the placeholder follows the column that slides in. Up-and-down and sideways scrolling are worked out separately and can both apply in one frame.

Right-to-left: the edges are the screen's, and the neighbouring snap point is found from the columns' measured starts, so the board turns towards the edge the pointer is at in both directions.

Alternatives considered:
- Turning snapping off during the drag and scrolling steadily. Too fast to stop on a column that fills the screen, and the board would jump when snapping comes back.
- A drop on a pager dot. A second gesture to learn, and the dots are 24 px high above the columns.

**D3. The drop is unchanged.** `up` reads the drop target at the release point, as before. The move is `sectionMoveWithUndo` (or the completion, for the Completed column), written by `useBoardMoves`. Nothing is written while the board scrolls, and a cancelled drag leaves the board where it scrolled to.

**D4. A board stays at its start until the person moves it.** Below 640 px, where the board shows one column at a time, `BoardView` sets the row's scroll position to its start whenever the first column changes, as long as the person has not pressed, scrolled with a wheel, chosen a pager dot or unfolded a strip in this board. After that it never moves the board. From 640 px the first column is 18 rem of a wider row and the rule is left out, so nothing changes there.

**D5. Nothing is added for the move without a drag, the tap or the circle.** They work, as checked above. The board test pins the marks and the start position; the drag's parts are unit tests of `lib/dnd`.

## Interface budget

No chrome row, task property, sidebar destination or shortcut is added. No scroll region is added: the board's row and its columns are the regions they were; the mark only lets a drag scroll them.

## Data model

None. A drop after the board scrolled writes the existing `section_id` and `position` fields of the task through `lib/ops`, as any drop on a column does. It applies locally, works offline and converges per field by the newer write. Scrolling writes nothing.

## Size

No dependency. A few hundred bytes of script in the main bundle; container image and runtime memory are unchanged.

## Risks

- A card held still within 32 px of the board's left or right edge for 300 ms turns the board even when the person meant to reorder inside the column. Moving the card away from the edge stops it, and the board can be turned back the same way.
- Checked in Chromium only. WebKit's handling of a smooth programmatic scroll in a snapping scroller during a touch is to be confirmed on an iPhone.
