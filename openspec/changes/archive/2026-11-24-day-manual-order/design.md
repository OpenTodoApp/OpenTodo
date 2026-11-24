## Context

- **Today's manual order already exists, but only under Project grouping** (today-project-drops). It is a personal `user_prefs.today_manual_order`, a `kOrderList` of at most 500 ids, placed and read with the saved views' bounded-order code (view-manual-order D2–D6). Its drops reuse the project-group move planner.
- **Other drops:** Time of day headings take part drops (`day-parts` "Setting the part of the day"), and Upcoming takes a drop on another day (`manual-ordering` "Drag a task to another day in Upcoming"). Since #1511, a reorder drop anywhere else in these views says why it can't reorder.
- **Due date order within a day** places timed tasks by time and the rest by tie-breaks. It does not look at a task's part of the day.

## Goals / Non-Goals

**Goals:**
- Rearrange a day by hand in Today, whatever its grouping, and in Upcoming.
- Keep one order per person that every device converges on.
- Make Due date order follow the shape of the day.

**Non-Goals:**
- Manual order in other smart lists.
- A separate order per date.
- Subtask reordering here.
- Group by in Upcoming.

## Decisions

### D1. One list for Today and Upcoming

Upcoming reads and writes `today_manual_order` too. A day's order is the same intent on both pages: the reporter arranges tomorrow in Upcoming and works through it in Today tomorrow.
- One global sequence is enough, because a move only ever places a task among tasks shown next to it. Relative order is what matters, as in a saved view grouped by label.
- The 500-id bound and its fallbacks are unchanged: ids the page does not show stay while their task is open, and a completed or deleted id leaves on the next move.
- Upcoming keeps its own Order by setting (`upcoming_sort_by`, additive value `position`), so choosing Manual on one page doesn't switch the other. An older client reads `position` as unknown and falls back to Due date (the read-time fallback of `listDisplayOf`).
- A date or part edited elsewhere does not touch the list, so the task keeps its rank on its new day.

**Alternative considered:** a new `upcoming_manual_order` field. Rejected: a second list would give Thursday two orders, depending on the page.

### D2. Groups and cross-group drops

The order host is the user's prefs row plus the page (`today` or `upcoming`), which names the sort fields a first move switches.
- **Movable groups:** in Today, the day's own groups under every grouping (not Earlier, Blocked, Waiting for a slot or Done today); in Upcoming, each day from Tomorrow on. With Start with Today on, Upcoming's Today groups keep taking day drops only.
- **Within a group:** the move is the bounded-order plan against the page's visible sequence (`orderPatch`). The first move under another order seeds the list from what the page shows, so nothing jumps.
- **At a line in another group:** one batch with one Undo holds the task's new value and the order. Upcoming: another day writes the day-drop patch (`dayDropPatch`, keeping time and zone, a span moving whole); with day parts on, a day is laid out by part (D4), and a line beside a row of another part writes that part. Today by Time of day: another part writes `dayPartFields`, keeping any due time (the stored part wins over the time for placement). A timed task can't land in the part-less group, because its time would place it elsewhere. Today by Project keeps today-project-drops. Under Priority, Label and None the line shows only within the task's group, as in saved views (view-manual-order D4).
- **Rights:** placing a task in one's own order needs no edit right, because the list is personal; a date or part change needs the task's project to be editable.
- **Keyboard:** Alt+Up/Down (with Shift, to the edge), Vim Shift+J/K and the row menu step within the displayed group through `stepInViewOrder`, and stop at its edge. In Upcoming with day parts on, the group is the task's part of that day.

### D3. Seeding, as on a project

The first move under another order seeds the list from what the page shows (today-project-drops D2), per page. Unplaced tasks follow Due date (D4).

### D4. Part of the day inside Due date order

While day parts are on, the comparator for a day's tasks ranks by part after the date: none first, then Morning, Afternoon and This Evening, as Time of day lays them out (none first there too). A task's part is its stored part or, without one, the part its time falls in (`placedPart`). Inside a part, timed tasks come by time, then untimed ones, then the existing tie-breaks.
- Because it is the grouping's rank, Today reads the same whether grouped by Time of day or not, and Upcoming's days get the shape asked for.
- The issue asked whether untimed tasks go after the parts. Following the grouping instead keeps one rule in the app, so the grouping and the order never disagree.
- In Upcoming, Manual order keeps the part as the first key within a day, then the stored rank, so a day keeps its shape while it is arranged by hand.
- With day parts off, Due date order is unchanged.

### D5. Interface budget

- No new control: Order by gains one choice on two pages (Today already had it under Project), and the rows get the drag affordance, drop line, menu items and keys that projects already have. Chrome rows above the first item, visible properties, destinations and scroll regions are unchanged; no new shortcut.
- No new string on screen ("Manual order", "Move to {name}", "Date changed", "Moved to {part}" and "Order changed" exist); the keyboard guide's two notes on dragging and sorted views are reworded and translated.
- Touch: the existing 350 ms hold.
- Accessibility: the row menu's Move items are the single-pointer alternative, already mapped.

## Data model

No new field or entity. `upcoming_sort_by` gains the value `position` (the field is a string; additive). `today_manual_order`'s schema comment now says it is shared by Today and Upcoming.

## Risks / Trade-offs

- **Concurrent reorders on two devices keep only the later list** (view-manual-order D3). This is accepted, as elsewhere; a date or part written in the same batch converges per field.
- **The Due date rank changes the order for people with day parts on.** It is a visible change, but it is the order the Today grouping already shows. The changelog entry names it.
- **Size:** no dependency. The drop resolver and the writer load lazily with the first drag or move.
