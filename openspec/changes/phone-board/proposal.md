# The board on a phone

## Why

The owner wants the whole app comfortable on a phone. A project as a board already shows one column at 88 % of the screen with snapping, a dot pager and the column's name in the bar. Three things were checked in a real browser at 390 × 844 with touch, and one more was found on the way:

- **A card could not be dragged to a column that is off screen.** A held card scrolls only the page and the sidebar, up and down (`drag-edge-scroll`, which left the board's columns out of scope). On a phone only the next column's 35 px edge is on screen, so a card reached the next column at most, and never the one before it.
- **The board opened on its second column.** Where the tasks without a section arrive after the sections, "No section" is put in front of the columns already on screen. The browser keeps the column it had snapped to, so the board opened on the second column and the first card was out of sight.
- **Moving a card without dragging already works.** A hold on a card opens the actions sheet, whose "Move to section…" lists the columns. Nothing to change.
- **A tap on a card already opens the task page, and the card's circle is already a 44 px target.** Nothing to change.

## What Changes

- **A held card scrolls the board.** While a card's drag is lifted and the pointer rests at the left or right edge of the board, the board moves to the neighbouring column: where columns snap (below 768 px), one column after 300 ms and one more every 700 ms; where they do not, steadily and faster nearer the edge. A column's own cards scroll up or down when the card is held near their top or bottom. For touch, mouse and pen.
- **A board opens at its first column** below 640 px, also when that column arrives after the others. Once the person has moved the board, it stays where they put it.

The drop writes what a drop writes today. No op field, route, setting, shortcut, string or dependency. Not **BREAKING**.

## Out of scope

- The card's look. A board's card stays a card; the phone UI's rows are not drawn on a board.
- "Move to section" in the card's sheet: it exists. Its confirmation step ("Apply 1 change") is the bulk actions' and is not changed here.
- Edge scrolling of other sideways scrollers (the timeline, the calendar): only a scroller that asks for it scrolls.
- Reordering columns by touch, and swipes on cards.

ROADMAP.md: "Shells that feel native" (the phone apps are this web app in a shell; the board is one of its screens).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sections-and-boards`: two new requirements, "A held card scrolls the board" and "A board opens at its first column".

## Impact

- Web:
  - `web/src/lib/dnd.ts`: sideways edge scrolling for scrollers marked `data-edge-scroll="x"`, and `data-edge-scroll="y"` joins the scrollers a drag scrolls up and down.
  - `web/src/app/BoardView.tsx`, `web/src/app/views/ViewResults.tsx`: the marks; `BoardView` keeps a board at its start until the person moves it.
- Docs: `docs/sections-and-boards.md`; `changelog.d/Changed/phone-board.md`.
- Size: a few hundred bytes of script, within the first-load budget.
