## MODIFIED Requirements

### Requirement: The panel slot has an address
The shell SHALL own one panel slot to the right of the content. It SHALL host project activity, project history and the calendar's planning list, one at a time, and a task only on a page that keeps a split (Process the Inbox) from 1024 px; everywhere else a task opens as its page at `/task/<id>` (see `web-app` "Task page"). A docked task's id SHALL be in the address (`?task=<id>`), so reloading or sharing the link reopens it; a `?task=<id>` address opened on any other page SHALL open the task's page. Escape or Close SHALL empty the slot and return focus to the row or control that opened it.

#### Scenario: Reload with a task open
- **WHEN** the user has a task's page open, opened from Upcoming, and reloads
- **THEN** the same task's page opens, and Close goes to the task's own list

#### Scenario: One occupant
- **WHEN** project activity is shown in the slot and the user opens a task
- **THEN** the task opens as its page and the slot is empty behind it

### Requirement: Panel width and expansion
From 1024 px the panel SHALL be a 26 rem column, 30 rem from 1440 px; a docked task SHALL offer an Expand action that opens it as its page at `/task/<id>`. Between 768 and 1023 px the slot's other occupants SHALL be a sheet of at most 28 rem over the content column, and below 768 px a bottom sheet; a task never docks there and opens as its page.

#### Scenario: Expand a long note
- **WHEN** the user activates Expand on a task docked beside the triage card
- **THEN** the task's page opens at `/task/<id>`

#### Scenario: The list stays in sight on a phone
- **WHEN** the user opens a task from Today on a 390×844 phone and taps Back
- **THEN** the task opened as its page, not as a sheet, and Today is back at the same scroll position with the task selected

### Requirement: Phone navigation
Below 768 px the shell SHALL show a bottom tab bar with Today, Inbox, Upcoming, Search and More (More opens the phone drawer, see "Phone drawer"), and a floating add button at the bottom right above the bar that opens quick add as a bottom sheet with the keyboard up. The bar and the button SHALL hide while a sheet is open and on the task page, which has its own bar with Back and the next and previous task. Tabs SHALL be at least 48 px tall and SHALL respect the bottom safe area. Every list SHALL reserve the add button's footprint under its last row, so the button never covers a row or its metadata. While the content scrolls down by more than 24 px the bar SHALL minimise to its icons and the button SHALL slide out below it; on any scroll up, at the end of the content, or 600 ms after scrolling stops, both SHALL return. When the system requests reduced motion the bar and the button SHALL stay in place at all times. This is presentation only; every action behind the bar and the button is the same local operation offline.

#### Scenario: Two taps to any primary view
- **WHEN** the user is in a project on a phone and taps Today in the bar
- **THEN** Today opens without the drawer

#### Scenario: Add from anywhere
- **WHEN** the user taps the floating add button in Upcoming
- **THEN** quick add opens as a bottom sheet with its field focused and the Upcoming default date applied, and the list stays visible above the keyboard

#### Scenario: The last row is readable
- **WHEN** a list of twenty tasks is scrolled to its end on a 390×844 phone
- **THEN** the last row's title and metadata are fully visible above the add button and the tab bar, and nothing is under the button

#### Scenario: The bar minimises while reading
- **WHEN** the user scrolls a long list down by 100 px on a phone without reduced motion
- **THEN** the tab bar shows only its icons at a smaller height and the add button is off screen, and a scroll up of any distance brings both back at full size

#### Scenario: Reduced motion keeps the bar
- **WHEN** reduced motion is requested and the user scrolls a long list down
- **THEN** the tab bar and the add button do not move
