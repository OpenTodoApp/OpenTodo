## ADDED Requirements

### Requirement: The day closes
Below 768 px the Done today ring SHALL move to a new value rather than jump, except under reduced motion. When the last open task of Today is completed while Today is on screen, the phone SHALL play the success haptic once, as well as the completion's own feedback; the briefing already says the day is done.

#### Scenario: The last task of the day
- **WHEN** Today on a phone lists one open task, three were completed today, and the person completes the open one
- **THEN** the row leaves as every completed row does, the ring fills, and the success haptic plays once

#### Scenario: A day that never had tasks
- **WHEN** Today is opened on a phone with no task for today and none completed today
- **THEN** no haptic plays

### Requirement: The task grows into its page
When a task's page opens from a phone list with screen transitions on, the tapped row's title SHALL move into the page's title while the page slides in, and Back SHALL move the page's title back into the row. With reduced motion, Display mode or no view transitions, the screens SHALL change as they do without this.

#### Scenario: Open and back
- **WHEN** the person taps a task in Today on a phone with motion on, then taps Back
- **THEN** the title travels from the row to the page and back, and only one element is named for the shared title in each capture

### Requirement: A hold shows the task
On a phone the actions sheet for one task SHALL be headed by that task as its row shows it (the check's priority ring, the title and the facts), not by a count, and the sheet's accessible name SHALL be the task's title. Several tasks keep the count.

#### Scenario: Hold a row
- **WHEN** the person holds "Call the plumber" in Today on a phone and lets go
- **THEN** the actions sheet opens headed by "Call the plumber" with its date and project, and its actions are the ones the sheet offered before

### Requirement: Drop on a day
While a task is dragged in Upcoming on a phone, each day of the week strip SHALL take it as a drop, as that day's group in the list does: the task moves to that day with Undo, its time kept. A day without tasks SHALL take a drop although it cannot be tapped.

#### Scenario: Drag to Thursday
- **WHEN** the person drags a task due tomorrow onto Thursday in the week strip
- **THEN** the task is due on Thursday with its time unchanged and a toast offers Undo

### Requirement: Dates in one tap
Quick add's sheet on a phone SHALL show Today, Tomorrow and Next week, the quick dates of the date picker, as dashed chips while the line has no date; a tap SHALL set that date in the line as the date picker does, and the chips SHALL go once the line has a date.

#### Scenario: Tomorrow in one tap
- **WHEN** the person types "Call Anna" in quick add on a phone and taps Tomorrow
- **THEN** the line carries tomorrow's date as a chip and the date chips go

### Requirement: Empty lists on a phone
An empty list on a phone SHALL show its illustration, words and actions centred in the free height between the header and the tab bar, the illustration larger than on the desktop.

#### Scenario: Empty Inbox
- **WHEN** the Inbox is empty on a 390×844 phone
- **THEN** its illustration and words sit in the middle of the space under the header, above the tab bar

### Requirement: The header follows the screen
On a project's screen the light at the top SHALL take the project's colour. On Today, once its large title has scrolled away and the bar shows the title, the bar SHALL show the day's progress next to its title as a small ring and the count done of the day's tasks.

#### Scenario: A green project
- **WHEN** a project coloured green is opened on a phone
- **THEN** the light behind its title is green

#### Scenario: Progress stays in sight
- **WHEN** Today has 3 of 10 done and the person scrolls until the title moves into the bar
- **THEN** the bar shows "Today" with a ring and 3/10

### Requirement: Today's cards
Below 768 px Today at a glance SHALL lay its cards out in two columns rather than three equal tiles: Up next as a card across the full width with its time large, how long until it and its title on up to two lines; under it Done today and Late side by side, each named above its figure, and either across the full width when the other is not shown. A card's name SHALL wrap rather than be cut, and no figure SHALL be cut at 360 px.

#### Scenario: A day with everything
- **WHEN** Today has a next task at 11:00, 8 of 14 done and 3 late at 09:58 on a 390 px phone
- **THEN** the Up next card spans the width with 11:00, "in 1h 2m" and the title, and Done today (a ring and 8/14) and Late (3) share the row under it

#### Scenario: Nothing late
- **WHEN** no task is late
- **THEN** Done today spans the row and says how many are left
