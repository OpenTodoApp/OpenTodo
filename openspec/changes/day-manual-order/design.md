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
- The 500-id bound and its fallbacks are unchanged, and a typical person's next week is far below it.
- Upcoming keeps its own Order by setting (`upcoming_sort_by`), so choosing Manual on one page doesn't switch the other.

**Alternative considered:** a new `upcoming_manual_order` field. Rejected: a second list would give Thursday two orders, depending on the page.

### D2. Moves stay in their group, and cross-group drops reuse the heading's drop

A row move is placed with the existing planner against the group's visible sequence:
- **Between rows of another group:** the drop runs the heading drop that already exists for that grouping (part of the day, project, day) and then the placement, in one batch with one Undo.
- **Priority and Label groupings:** they have no heading drop today, so the drop line shows only within the task's own group, as in saved views (view-manual-order D4).
- **A task with a due time under Time of day:** it can be placed among its part's tasks. Dropping it into another part sets the part, as the heading drop does today, and the stored part keeps winning over the time (`day-parts`).

### D3. Seeding, as on a project

The first move under another order seeds the list from what the page shows. This is the today-project-drops D2 rule, applied to Upcoming per page, so nothing jumps. Unplaced tasks follow Due date (D4).

### D4. Part of the day inside Due date order

While day parts are on, the comparator for one day's tasks ranks by part: none first, then Morning, Afternoon and This Evening, exactly as the Time of day grouping lays them out. A task's part is its stored part or the part its time falls in. Inside a part, timed tasks come by time, then untimed ones, then the existing tie-breaks.
- Because it is the same rank as the grouping, Today reads the same whether grouped by Time of day or not, and Upcoming's days get the shape the reporter asked for.
- The issue asked to put untimed tasks after the parts. Following the grouping instead keeps one rule in the app, so the grouping and the order never disagree.
- With day parts off, Due date order is unchanged.

### D5. Interface budget

- No new control: Order by gains one choice on two pages, and the rows get the drag affordance, drop line, menu items and keys that projects already have.
- No new string ("Manual order" exists).
- Touch: the existing 350 ms hold.
- Accessibility: the row menu's Move items are the single-pointer alternative, already mapped.

## Risks / Trade-offs

- **Concurrent reorders on two devices keep only the later list** (view-manual-order D3). This is accepted, as elsewhere.
- **The Due date rank changes Upcoming's order for people with day parts on.** It is a visible change, but it is the order the Today grouping already shows. It goes in the changelog under Changed.
- **Size:** no dependency, and the move code loads lazily. The first-load delta will be measured and reported with the build.
