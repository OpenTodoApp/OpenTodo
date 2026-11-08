# Design

## D1: Reuse the sidebar drop, not the reorder

Upcoming rows are already draggable for the sidebar targets (`useListDrag` with `taskDrops`): a drop on an element with `data-task-drop` resolves to `drop:<value>` and goes through `dropTasks` → `dropUndoable`, with the bulk selection carried and the read-only check done. A day group becomes one more such target, `day:<date>`, on the group's `<section>`. Because Upcoming is not manually ordered, the drag shows no drop line between rows; the whole day rings instead (the existing `data-drop-active` styling). No change to `lib/dnd.ts` or `useListDrag`, so mouse, pen and the touch hold behave as everywhere else.

## D2: The calendar's rule

`lib/dayDrop.ts` holds one pure rule, the one Month's and Week's drop on a day use:

- A task with a due date: the date becomes the day, the time stays, and a zoned due keeps its zone (`dueFromView` over the viewed due).
- A span (`multi-day-tasks`): it moves whole, start and due by the same number of days (`moveSpanPatch`), as the calendar's span drag and Month's arrow move do.
- A task listed by its deadline: it is planned for the day (`due` set); the deadline never moves, as on the calendar.
- A task listed by its start (deferred, no project, no date): it stays deferred, to the new day (`start`); on today it becomes due today with the start cleared, since a start of today would send it to the Inbox.
- A repeating task: only its date changes, as on the calendar; the rule stays.
- Already on that day, completed or deleted: nothing is written and no toast shows.

The batch is recorded through the undo log (`apply`), so it is one timestamp, local first, offline through the outbox and per-field last-writer-wins like every date edit. The toast says "Date changed" for one task and "N tasks moved" for several, both existing strings.

## D3: Which groups take a drop

Date groups (Tomorrow onwards) and the event-only days `groupsWithEventDays` inserts carry `dropDay: <date>`. With Start with Today, Today, Morning, Afternoon and This Evening carry `dropDay: today`: the task moves to today and keeps its time and part. That does not contradict "the part headings take no drops in Upcoming" in spirit (the part never changes there), but the sentence is reworded. Earlier (the past), Blocked and Waiting for a slot carry none. Upcoming does not list empty days, so there is nothing more to target; dropping a task on its own day writes nothing.

## Interface budget

No new chrome, property or shortcut; the drop ring already exists. The keyboard guide's note on sorted views now says Upcoming takes a drag onto another day.

## Data model and size

No new field or route. Container image unchanged; the web first load grows by a few hundred bytes (the rule sits beside `undoActions`).
