# Proposal

## Why

Part of the "Precision" redesign, after `precision-tokens`, `precision-shell` and `precision-rows`. The board and the timeline still wear the look from before them. The round-2 mock-ups (`project-board.png` and `project-timeline.png`) show the target:

- **The board** is a row of sunken column bands that run the full height of the page. Each card holds a title and one compact row of properties with the assignee at its end. A dashed "Add a section" column closes the row of columns.
- **The timeline** reads like the list:
  - the rows are the list's height;
  - sections are group bars;
  - bars carry their title;
  - a late task says how late it is;
  - a deadline is a diamond;
  - today is a calm accent line with a "Today" mark in the axis.

Today the board's columns shrink to their content, so a short column ends mid-page. A card's properties are a plain run of muted words. "+ Add section" is a small text button. The timeline's bars are unlabelled, its today line uses the danger colour, and a bar that ended before today is only dimmed, even when the task is overdue.

## What Changes

### Board
- **Full-height column bands.** Every column's sunken band runs from the top of the board to its bottom, whatever the number of cards. The header holds the name, the count, the add button and the menu.
- **"Add a task" is always at the foot of a column's cards** in an editable project, not only in an empty column.
- **Precision cards.**
  - The title takes at most two lines.
  - Then comes one property row. The date (calendar icon, in its due-ladder tone), the estimate (clock icon) and the subtask progress (check icon) lead. The label chips follow, and the assignee sits at the row's end.
  - Any other fact stays on the same row, wrapping when needed.
  - The card sits on the raised surface over the band.
- **An "Add a section" column:** a dashed outline the height of the board, with a plus icon and "Add a section", which turns into the name field.

### Timeline
- **List-height rows:** 36 px rows, with titles at body size.
- **Group bars:** sections and "Unscheduled" are the list's group bars (sentence case, name and count), not uppercase labels.
- **Labelled bars:**
  - A bar wide enough (6 rem or more) shows the task's title inside it.
  - A shorter bar is followed by its length ("1 day", "3 days").
  - A late bar is followed by "n days late" in the overdue tone.
- **Late is overdue:** a bar is late when the task's deadline or due day lies before today. A bar with only a past start is still just dimmed.
- **Deadline diamond:** the deadline is a small diamond in the warning tone, or the overdue tone when late, at the deadline day. When the bar has nothing else after it, the diamond is followed by "Deadline Nov 3".
- **Today:** the today line is the accent colour, with a "Today" mark at the top of the axis.
- **Week labels:** weekly axis columns read as a range ("20–26 Oct").

Every behaviour stays: dragging cards between columns, dragging bars and their ends, the keyboard on both layouts, the phone pager, the board of filters, and offline and live updates.

Out of scope:
- The project header, the view tabs and the toolbar (`precision-shell`, `views-and-display`).
- The phone's board chrome (`precision-phone`).

## Capabilities

### Modified Capabilities

- `sections-and-boards`: "Board view" (full-height bands, add at the foot, the Precision card and its property row, the "Add a section" column).
- `project-timeline`:
  - "Timeline layout of a project": the row height, group bars, the today line and mark, the week ranges;
  - "Bars from start, due and deadline": labels, late and the late count, the deadline diamond.

## Impact

- **Web:**
  - `app/BoardView.tsx` and `app/Sections.tsx` (the band, the foot add, the add-section column);
  - `app/TaskRow.tsx` (the card's property row);
  - `app/TimelineView.tsx` and `lib/timeline.ts` (row height, group bars, labels, late, diamond, today mark);
  - `index.css` (band and dashed column);
  - stories and tests;
  - a handful of new strings in five languages.
- **Server, API, sync, data:** none.
- **Bundle:** under 2 KB of JS and CSS; no dependency.
