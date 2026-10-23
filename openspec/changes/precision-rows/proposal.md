# Proposal

## Why

Part 3 of the "Precision" redesign (after `precision-tokens` and `precision-shell`). The round-2 mock-ups show a list you can scan down: one line per task, the title on the left and its properties in aligned columns on the right. Today's row is two lines almost everywhere, because every property goes into a metadata line under the title, and its project and counts sit in a trailing group whose position depends on the screen. On the full-width surface from `precision-shell` that wastes the space and makes values hard to compare.

- **"The space is all used":** a wide list should spend its width on properties, not on a second line.
- **Scan down, not across:** the date of every row sits in the same place, so is the project and the estimate.
- **Colour only for state:** the selected row and the hovered row become neutral surfaces; group headers become quiet filled bars, not uppercase labels.
- **Say what is hidden:** a project that hides its completed tasks says so at the end of the list.

## What Changes

- **One-line rows from 40 rem of row width.** The row is its own size container, so a list in the docked panel, a dashboard panel or a phone gets the layout its width allows. The title leads, with the repeat mark and the counts beside it.
- **The property column:** fixed cells, in order: the date, the project (when the list shows projects), the labels or else the deadline or else the subtask progress, the estimate, and the assignee as an avatar. Every row of a list uses the same widths, so values line up.
- **Dropping by width:** the column drops the assignee and estimate under 56 rem and the third cell under 48 rem; under 40 rem the row keeps its title and one metadata line under it. The task panel shows every property.
- **A second line only when needed:** the start, a displaced deadline, blocked, the streak, field values, a parent's name and the sample mark.
- **Group bars:** a 32 px strip on the raised surface, the label in sentence case at medium weight, the count faint. Board columns keep a plain heading.
- **Neutral selection:** the selected row uses the selected-row surface with its accent bar; hover uses the hover surface. The revealed actions are a small floating cluster on the popover surface over the column's end.
- **The hidden note:** a project list whose completed tasks are hidden ends with "2 completed tasks hidden by display options · Show".

Every behaviour stays: selection, ticking, drag and drop, swipe, inline editing, keyboard focus and the row-and-cursor rules. The card on the board and the compact row of Plan keep their shapes.

Out of scope:
- The display panel that chooses the visible properties is `views-and-display`.
- Phone rows with one property are `precision-phone`.
- The display mode's own labels are unchanged.

## Capabilities

### Modified Capabilities

- `task-list-presentation`:
  - "One row anatomy": one line with a property column, by row width;
  - "Metadata language": the column's cells, the repeat mark beside the title;
  - "Group headers": group bars in sentence case;
  - "Completed group in a project": the hidden note;
  - "Selected row indicator": neutral surfaces;
  - "Revealed row actions": the floating cluster.
- `display-mode`: "Today display" states its own label style instead of pointing at the list's.

## Impact

- **Web:** `app/TaskRow.tsx` (the row line, the cells, the marks), `index.css` (the property column rules, selection and hover), `app/task-list/RowActionCluster.tsx`, `ui/patterns/ListGroupHeader.tsx`, `app/Sections.tsx`, `app/task-list/ListChrome.tsx` and `app/TaskListView.tsx` (the hidden note); one new string in five languages.
- **Server, API, sync, data:** none.
- **Bundle:** under 1 KB of CSS and JS; no dependency.
