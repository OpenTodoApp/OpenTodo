# Proposal

## Why

Upcoming lists the days ahead, but the only way to move a task to another of those days is its date picker. The calendar's Week, Month and Plan already take a dragged task onto a day; Upcoming, where people plan the week, does not ([#892](https://github.com/OpenTodoApp/OpenTodo/issues/892)).

## What Changes

- In Upcoming, a task dragged onto another day's group (its heading or any of its rows) moves to that day, as a drop on a calendar day does: the do-on date changes and keeps its time and time zone; a span moves whole; a deadline never moves. One batch with Undo; a bulk selection moves together. On a touch screen the drag starts after the usual press and hold.
- A day shown only for its calendar events takes the drop too. With Start with Today on, Today's day groups (Today, Morning, Afternoon, This Evening) take a drop for today; Earlier, Blocked and Waiting for a slot take none.
- Upcoming still keeps its own order: no drop line between rows, no reordering within a day, no Alt moves.

No new field, route or environment variable; the op log format is not **BREAKING**.

## Capabilities

### New Capabilities

### Modified Capabilities

- `manual-ordering`: Upcoming stays sorted but takes a dragged task onto another day.
- `upcoming-start-with-today`: Today's day groups take a day drop in Upcoming; the part headings still never change the part.

## Impact

- `web/src/lib/dayDrop.ts` (the drop rule), `lib/undoActions.ts` (`day:<date>` targets), `lib/listGroups.ts` and `app/calendar/UpcomingAgenda.tsx` (which groups take a drop), `app/task-list/ListGroups.tsx` (the drop target and its ring).
- The keyboard guide's note on sorted views, `docs/today-and-upcoming.md`, `docs/work-from-the-list.md`.
- No new dependency; a few hundred bytes in the first load.

Out of scope: reordering within a day, a keyboard way to move a task by a day in Upcoming (the Actions menu's date, `.`, remains the keyboard way), dropping projected occurrences of a repeating task, and drops in Today. Advances no open ROADMAP item.
