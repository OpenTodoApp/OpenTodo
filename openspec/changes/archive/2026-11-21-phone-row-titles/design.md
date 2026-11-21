# Design

## Context

GitHub issue 1339, seen at 360 px in the interface audit. What the code does today:

- **One title component.** Every list row, board card and Today row draws its title through `RowTitle` in `web/src/app/TaskRow.tsx`: `line-clamp-2 break-words`, a tooltip while it is cut (`useOverflowing`), the whole title as the open control's name. `TaskListRow` and its parts (`RowActionCluster`, `RowDetails`, `RowSchedule`) add nothing to the title.
- **Where it is cut.** One rule in `web/src/index.css`, "The phone row" (`precision-phone` D2, kept by `task-list-width` D1): below 768 px of screen and 40 rem of row, `[data-row-title] { -webkit-line-clamp: 1 }`. At 360 px the title column is 96 to 200 px wide: about 15 characters beside a time and a mark.
- **The row is already built for a tall title.** The row is `flex items-start`; the leading slot, the checkbox, the time and Show details carry `margin-top: 0.75rem` and sit on the first line; the grip is `self-start`; the marks sit on the title's first baseline. Show full task titles (`full-task-titles`) already makes phone rows of any height, and the Inbox's source line already makes them 64 px.
- **Nothing assumes a row's height.**
  - Scroll estimates: a row or block (`rowBlocks.ts`, `.row-offscreen`, `.row-block`) not drawn yet stands at `--row-estimate`, the average height of the first rows drawn (`RowEstimate` in `ListGroups.tsx`); once drawn it keeps its last height (`contain-intrinsic-size: auto`).
  - Leaving rows measure their own height into `--row-h` (`TaskRow.tsx`), and list reflow (`motion.ts`) reads rectangles.
  - Drag reads the pressed row's `offsetHeight` and the rows' rectangles (`useListDrag.ts`, `lib/dnd.ts`); the drop line is placed on the row's edge.
  - The swipe edges are `absolute inset-y-0` in the row (`RowSwipe.tsx`), so they are as tall as the row.
  - The inline editor replaces the open control and grows with its text; subtask indentation is padding on the row; Today's closed list uses the same row.
- **Existing preferences.** Density (`appearance-preferences`, Comfortable or Compact) sets row padding, and on a phone both are the same 44 px row. Show full task titles lifts the clamp at every width. Rows: One line or Detailed (`row-layouts`); a detailed row's title had the same one-line cut on a phone, from the same rule.
- **Board cards** are already two lines at every width. The calendar's compact rows (`CompactRow`) are one line by their own class and are not the list row.

## Goals / Non-Goals

**Goals:** most titles read in full on a phone; controls keep their place and size; wider screens unchanged; one rule.

**Non-Goals:** a new preference, moving or removing row controls, changing the text size, the lists that do not use the task row.

## Decisions

### D1. The phone row has no clamp of its own

The one-line clamp is removed, so the row's two-line clamp applies on a phone as everywhere else. A short title is one line and its row stays 44 px; a longer one takes a second line and the row is 64 px (12 px, two 20 px lines, 12 px); a third line is cut with an ellipsis, with the whole title in the control's name and in the task.

Every row, not only rows "under pressure": a rule that looks at the time, the mark and the cell would make titles of the same length cut differently from row to row, and the plain rule already leaves short titles alone.

Rejected:
- A "wrap titles on phones" preference: Show full task titles exists, and the default was the problem.
- Moving the date or the time under the title to widen the first line: it changes the row's anatomy and where the dates line up, for a few more characters.
- Three lines: with the Inbox's source line a row would reach 104 px.

### D2. The end cell sits on the first line

The open control's grid centred the end cell (the date, else the deadline, the avatar or the project marker) on the title. Beside two lines that puts it between them. It now aligns to the start with the title's line height (`align-self: start; min-height: 1.25rem`), so it is where it was on a one-line row and the dates of a list still end at one x. This rule existed for Show full task titles only; it becomes the phone row's, and the preference's copy is deleted. Measured at 360 and 390 px: on rows whose title did not change, no box moved.

### D3. How it combines with the existing settings

| Setting | Phone row title |
| --- | --- |
| Default | up to two lines, then an ellipsis |
| Show full task titles | every line |
| Density Comfortable or Compact | no effect on a phone (as before) |
| Rows: Detailed | up to two lines, then its details line |

### D4. Heights

No code changes: the estimate follows the taller rows because it is measured from them, as with full titles. A list seen before the change keeps remembered heights only for the life of the page.

## Risks / Trade-offs

- **Fewer rows per screen.** A list of long titles shows about a third fewer rows on a phone (64 px against 44 px). That is the trade the issue asks for; short titles cost nothing.
- **Narrow columns wrap short titles.** At 360 px, beside a slot's icon and time, "Reply to the landlord" takes two lines. It reads in full, which one line did not allow.
- **WebKit** draws every row (no `content-visibility` there), so it has no estimate to get wrong.

## Data model, size, interface budget

- Data model: none. No op, no field, no preference.
- Size: no dependency; the stylesheet loses one declaration and one rule. Image size and memory are unchanged.
- Interface budget (`docs/interface-guide.md`): no chrome above a list, no task property, no sidebar destination, no scroll region and no shortcut is added. A row shows the same properties as before.

## Other lists that cut titles on a phone

Included, because they draw the task row: Inbox, Today, Upcoming, Anytime, Someday, projects, labels, filters, saved views, dashboards, the review screens, the method views and the assistant's task blocks.

Not included (their own one-line rows): the calendar's compact rows in Plan, Day and Week agendas; Close the day's steps; the command bar's results; the Notes page.
