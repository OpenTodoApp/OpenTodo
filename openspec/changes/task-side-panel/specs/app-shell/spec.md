## MODIFIED Requirements

### Requirement: The panel slot has an address
The shell SHALL own one panel slot to the right of the content. It SHALL host project activity, project history and the calendar's planning list, one at a time. From 1024 px it SHALL host a task only on a page that keeps a split: Process the Inbox, the Inbox, and with the side panel preference the lists of `web-app` "Task details in a side panel". Everywhere else a task opens as its page at `/task/<id>` (see `web-app` "Task page"). A docked task's id SHALL be in the address (`?task=<id>`), so reloading or sharing the link reopens it; a `?task=<id>` address opened on any other page SHALL open the task's page. Escape or Close SHALL empty the slot and return focus to the row or control that opened it; with the side panel, Escape on the list leaves the panel as it is and Close also closes the side panel (see `web-app` "Task details in a side panel").

#### Scenario: Reload with a task open
- **WHEN** the user has a task's page open, opened from Upcoming, and reloads
- **THEN** the same task's page opens, and Close goes to the task's own list

#### Scenario: One occupant
- **WHEN** project activity is shown in the slot and the user opens a task
- **THEN** the task opens as its page and the slot is empty behind it

#### Scenario: A list with the side panel docks the task
- **WHEN** a user with the side panel preference clicks a task in a project on a 1440 px wide screen
- **THEN** the task shows in the slot beside the project's list, the address is the project's with `?task=<id>`, and no page opens

### Requirement: Panel width and expansion
From 1024 px the panel SHALL be a 26 rem column, 30 rem from 1440 px; on a page that keeps a split it SHALL be about half the content's width (at least 26 rem, at most 44 rem) until the user resizes it. A docked task SHALL offer an Expand action that opens it as its page at `/task/<id>`. Between 768 and 1023 px the slot's other occupants SHALL be a sheet of at most 28 rem over the content column, and below 768 px a bottom sheet; a task never docks there and opens as its page.

Wherever a task docks, the panel's left edge SHALL be a resize handle. Dragging it SHALL change the panel's width. The handle SHALL be a focusable separator named "Resize the task panel" that announces its width: ← and → widen and narrow the panel by 16 px (64 px with Shift), and Home or a double click restores the default. The width SHALL be kept on the device and used by every page that keeps a split. It SHALL never be synced, because widths suit a screen and not an account. It SHALL stay between 22 rem and the window's width less 38 rem (at most 64 rem), so the list always keeps room; a narrower window shrinks the panel without forgetting the chosen width.

#### Scenario: Expand a long note
- **WHEN** the user activates Expand on a task docked beside the triage card
- **THEN** the task's page opens at `/task/<id>`

#### Scenario: The list stays in sight on a phone
- **WHEN** the user opens a task from Today on a 390×844 phone and taps Back
- **THEN** the task opened as its page, not as a sheet, and Today is back at the same scroll position with the task selected

#### Scenario: Resize and remember
- **WHEN** the user drags the docked task's left edge 200 px to the left on a 1600 px wide screen, then reloads and opens a task in the Inbox
- **THEN** the panel is 200 px wider than before, and after the reload the Inbox's panel has the same width

#### Scenario: Resize with the keyboard
- **WHEN** the user tabs to the panel's resize handle and presses ← three times, then Home
- **THEN** the panel widens by 48 px, the handle announces each new width, and Home returns it to the default width

#### Scenario: Another device keeps its width
- **WHEN** the user widens the panel on a desktop and opens the Inbox on a laptop of the same account
- **THEN** the laptop's panel has its own width, unchanged

#### Scenario: The list keeps room
- **WHEN** the user drags the handle as far left as it goes on a 1280 px wide window
- **THEN** the panel stops at the window's width less 38 rem, and the list's rows drop their right-hand cells as their width requires
