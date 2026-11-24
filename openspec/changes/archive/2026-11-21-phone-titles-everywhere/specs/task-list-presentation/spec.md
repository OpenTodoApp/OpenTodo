# Spec Delta

## ADDED Requirements

### Requirement: Titles on a phone outside the task row
On a screen narrower than 768 px, the lists that name a task or a note with a row of their own SHALL show its title by the task row's rule: on one line when it fits, on two when it is longer, ending with an ellipsis after two; while the user's Show full task titles preference is on, on as many lines as it takes. These lists are: the Notes list; the focused day's list under the Month; the Week's day lists, with their repeating occurrences and the checklist of a block; the Plan's days; the task lists of Close the day (What got done, What moves, Tomorrow's first thing); and the names of the command bar's results. The rule reads the preference the device already holds, so it applies offline and follows the preference when it arrives by sync; it writes nothing.

A row whose title fits on one line SHALL keep the height it had, at least 44 px where it is a touch target, and a longer title SHALL add the height of its extra lines only. What stands beside the title (the time, the estimate, the priority, a span's day, a checkbox, a radio mark, a row's menu) SHALL stay on the title's first line, at the same horizontal position and size as on a one-line row, and SHALL NOT overlap the title. A project's name beside a title in Close the day SHALL take at most a third of the line. The whole title SHALL stay the row's accessible name.

A row whose height or shape is fixed by its place SHALL keep one line at every width: a block in the time grid of Day and Week and a row of the all-day lane above it, a row in a Month cell or in a Plan column, a deadline marker, a calendar event, the selected task's chip in the command bar, and a result in a list long enough to be drawn in a window of fixed rows. From 768 px every list named here SHALL be as it was: one line and an ellipsis, with or without the preference.

#### Scenario: A long title in the Week on a phone
- **WHEN** the Week on a 360 px phone lists "Send the signed contract back to the landlord with the inventory list attached" at 16:00 with an estimate of 20 minutes
- **THEN** the title is on two lines ending with an ellipsis, "16:00" and "20m" are beside its first line, and the row above it with a short title is 44 px tall

#### Scenario: The focused day under the Month
- **WHEN** the user taps a day on the Month at 360 px whose tasks include one with a long title and priority 2
- **THEN** that row shows the title on two lines with the time before and the priority after its first line, and the other rows are 44 px tall

#### Scenario: Close the day with a long project name
- **WHEN** What got done at 360 px lists "Compare the three kitchen quotes line by line" of the project "Home renovation with a rather long project name"
- **THEN** the title reads on two lines beside the check mark, and the project's name is cut within a third of the line

#### Scenario: A search result
- **WHEN** the user types "venue" in the command bar on a 360 px phone and a task "Book the venue for the autumn team dinner before the deposit deadline passes" matches
- **THEN** the result shows the title on two lines and "Inbox · Tomorrow 09:30" on one line under it, and a result with a short name is one line and 44 px tall

#### Scenario: Show full task titles
- **WHEN** the preference is on and the Plan on a 360 px phone lists a task whose title needs four lines
- **THEN** the row shows all four lines with its time beside the first, and the same row in a Plan column at 1280 px is one line

#### Scenario: The preference changed offline
- **WHEN** the user turns Show full task titles on while offline with the Notes list open on a phone
- **THEN** the titles show in full at once, and the user's other phone shows them in full after sync without a reload

#### Scenario: A fixed row keeps one line
- **WHEN** the Day's time grid on a 360 px phone holds a 30-minute task with a long title
- **THEN** its block keeps its height and shows the title on one line

#### Scenario: A wide screen
- **WHEN** the same lists are opened at 768 px and at 1280 px
- **THEN** every title is on one line ending with an ellipsis when it is cut, and no row's height or position differs from before this change
