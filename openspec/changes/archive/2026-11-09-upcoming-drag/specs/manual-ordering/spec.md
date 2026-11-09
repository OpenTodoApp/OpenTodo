## MODIFIED Requirements

### Requirement: Which views are manually ordered
Manual ordering SHALL apply to project views (list and board), the Inbox, the project tree in the sidebar, label pages and saved list views. A project list shown in another order (OpenSpec `list-display-options`) SHALL stay draggable and movable by keyboard, and a move SHALL switch it back to manual order first; label pages and saved list views SHALL behave the same way (see "Manual order of a label page or saved view"). Today, Upcoming, Anytime, Someday, Assigned to me, Completed and place lists SHALL keep their own sort rules, offer no Manual order and use position only to break ties; dragging among rows and keyboard moves SHALL be unavailable there, except that Upcoming SHALL take a dragged task onto another day (see "Drag a task to another day in Upcoming"). The unsaved New view page SHALL not offer Manual order.

#### Scenario: Not draggable in Today
- **WHEN** the user tries to drag a task in Today or presses Alt+Up there
- **THEN** nothing moves and the item is not shown as draggable

#### Scenario: No reordering within a day of Upcoming
- **WHEN** the user drags a task in Upcoming over another task of the same day
- **THEN** no drop line shows, and releasing changes nothing

#### Scenario: Position as tie-breaker
- **WHEN** two tasks are due on the same day with the same priority in Upcoming
- **THEN** they are listed in the order given by their positions

#### Scenario: Project shown in another order
- **WHEN** a project is ordered by due date and the user presses Alt+Up on a task
- **THEN** the project's order becomes Manual order and the task moves one place up in it

#### Scenario: No Manual order before saving
- **WHEN** the user opens Display options on the New view page
- **THEN** Order by offers Due date, Priority, Created, Deadline and Title, and not Manual order

## ADDED Requirements

### Requirement: Drag a task to another day in Upcoming
In Upcoming, a task dragged with a mouse or pen, or on touch after the same press and hold as reordering, and released anywhere on another day's group (its heading or its rows) SHALL move to that day as a drop on a day of the calendar does: its due date SHALL become that day and keep its time and time zone; a task that spans several days SHALL move whole, its start and due by the same number of days; a deadline SHALL never move, so a task listed by its deadline gets that day as its due date; a task listed by its start date (deferred, without a project or a due date) SHALL stay deferred to that day, and on today SHALL become due today; a repeating task SHALL change only its date. While the pointer is over a day, that day's group SHALL show the drop ring and no drop line SHALL show between rows. A day listed only for its calendar events SHALL take the drop too. With Start with Today on, Today's day groups (Today, Morning, Afternoon, This Evening) SHALL take a drop for today; Earlier, Blocked and Waiting for a slot SHALL take none. When the dragged task is part of the bulk selection, every selected task SHALL move, each by these rules. The move SHALL be one batch of operations with a toast offering Undo ("Date changed", or how many tasks moved), applied locally first so it works offline, uploaded when the network returns and converging per field by last-writer-wins like any date edit. Dropping on the task's own day, outside any day, on a task the user may not change, or pressing Escape SHALL change nothing. Upcoming SHALL keep its own order: the task appears where its new day sorts it.

#### Scenario: Drop on another day
- **WHEN** "Dentist" is due tomorrow at 09:30 and the user drags it under Saturday's heading in Upcoming
- **THEN** it is due Saturday at 09:30, listed under Saturday, and the toast reads "Date changed" with Undo, which puts it back on tomorrow

#### Scenario: Touch
- **WHEN** on a phone the user presses and holds "Call Ada", then moves it onto Friday's group and lifts the finger
- **THEN** "Call Ada" is due Friday

#### Scenario: Deadline stays
- **WHEN** "File taxes" has no due date and the deadline 20 October, is listed under 20 October, and the user drops it on 16 October
- **THEN** it is due 16 October and its deadline is still 20 October

#### Scenario: A span moves whole
- **WHEN** a trip spans 16 to 18 October and the user drops it on 20 October
- **THEN** it spans 20 to 22 October

#### Scenario: Earlier takes no drop
- **WHEN** Start with Today is on and the user releases a task over the Earlier group
- **THEN** nothing changes and no operation is queued

#### Scenario: Offline
- **WHEN** the device is offline and the user drops a task on another day
- **THEN** the list shows it under that day at once, and its due date is uploaded when the network returns

#### Scenario: Escape
- **WHEN** the user drags a task over another day and presses Escape
- **THEN** the task keeps its date and no operation is queued
