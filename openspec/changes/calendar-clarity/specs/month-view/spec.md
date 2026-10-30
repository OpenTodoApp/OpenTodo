## ADDED Requirements

### Requirement: Add with the pointer in the month
A double-click on an empty part of a Month day cell SHALL open the add dialog with that date; a right-click there, or a long press of 500 ms on touch, SHALL open the calendar's add menu for that date. Day cells SHALL show a hover state under a fine pointer. The existing `q` on the focused day SHALL stay the keyboard equivalent. The task SHALL be created locally with no network round trip.

#### Scenario: Double-click a day
- **WHEN** the user double-clicks an empty part of the 15th, types "Dentist" and presses Enter
- **THEN** a task "Dentist" due on the 15th appears in that cell at once

#### Scenario: Hover
- **WHEN** a fine pointer moves over the 16th
- **THEN** the 16th's cell shows the hover surface and the 15th's does not

#### Scenario: Double-click on a task row
- **WHEN** the user double-clicks a task row inside a cell
- **THEN** the task opens as before and no add dialog appears
