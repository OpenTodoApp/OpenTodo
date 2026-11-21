# Spec Delta

## ADDED Requirements

### Requirement: A page header follows its own width
From 768 px, where a page shows its own header, the header SHALL be laid out by the width of the column it sits in, not by the window's. A header narrower than 40 rem on a touch screen, or narrower than 28 rem with a mouse, is a narrow header: a 768 px window with the sidebar open, and a list beside the docked task panel. A narrow header SHALL follow the phone bar's rules in its own row:

- On a page with a menu (the overflow menu or the page's own menu) Help SHALL be the last item of that menu, after a separator, opening the same guide section and returning focus to the menu's button; the row SHALL show no Help button. A page without a menu SHALL keep the button.
- A list SHALL show Process the Inbox or Ask, the chip of an active filter and its display options in the row; Select tasks, the duration filter's choices, Display mode, and on a project its Layout, Share and Add a note SHALL be items of the page's menu, reachable by tap and with the menu's keyboard model.
- The title SHALL give way, down to 6 rem, before the actions wrap under it, and a cut title SHALL keep its full text reachable as it does at other widths.
- A task's page SHALL show only the nearest step up of its path, as a back arrow followed by the step's name; the task's title SHALL NOT be repeated in the path. The name SHALL show whole or not at all: while it does not fit, the arrow alone leads back and its accessible name is the step's name.
- Statistics SHALL be one row: the title, the period as one menu button showing the chosen period, and the menu holding Export time entries.

A header of 40 rem or more on a touch screen, or of 28 rem or more with a mouse, SHALL keep its actions, its Help button and its full path as before. This is presentation only: it reads and writes no data, sends nothing and behaves the same offline; there is nothing to converge.

#### Scenario: Inbox on a tablet beside the sidebar
- **WHEN** the Inbox is open in a 768 px window on a touch screen with the sidebar open
- **THEN** the header is one row with the title, "3 to sort" in full, Process, Display options and the Inbox menu, and no Help button

#### Scenario: Moved actions by tap
- **WHEN** the user taps the Inbox menu in that header
- **THEN** the menu lists Select tasks and the duration filter's choices, and Help is its last item

#### Scenario: Help by keyboard
- **WHEN** the user focuses the menu's button in that header, presses Enter, then End, then Enter
- **THEN** focus is on Help after End, the guide's section for the Inbox opens, and closing it puts focus on the menu's button

#### Scenario: A task's page
- **WHEN** a task of the Inbox is open as its page in a 768 px window on a touch screen with the sidebar open
- **THEN** the header is one row: a back arrow with "Inbox", the position, Next task, Previous task, Close and the task's menu; the task's title is the page's heading below and not in the path

#### Scenario: A step whose name does not fit
- **WHEN** the nearest step up is a parent task with a name longer than the row has room for
- **THEN** the row shows the back arrow without text, and the arrow's accessible name is the parent's name

#### Scenario: Statistics
- **WHEN** Statistics is open in a 768 px window on a touch screen with the sidebar open
- **THEN** the header is one row with "Statistics", a button reading "This week" that opens the five periods, and the menu with Export time entries

#### Scenario: A project with a long name
- **WHEN** a project named "Home renovation with a rather long project name" is open as a board in a 768 px window on a touch screen with the sidebar open
- **THEN** the header is one row with the name and the project menu; Layout, Share, Select tasks, the filter, Add a note and Help are in the menu

#### Scenario: A list beside the docked panel
- **WHEN** the Inbox is open in a 1024 px window on a touch screen and a task is open in the panel beside it
- **THEN** the Inbox header shows Process, Display options and the Inbox menu, and Help is in that menu

#### Scenario: The sidebar collapsed
- **WHEN** the Inbox is open in a 768 px window on a touch screen with the sidebar collapsed to icons
- **THEN** the header shows Process, Select, Filter, Display options, the Inbox menu and the Help button, as before

#### Scenario: A mouse at 1280 px
- **WHEN** the Inbox is open in a 1280 px window with a mouse, with or without a task in the panel beside it
- **THEN** the header shows the same controls as before, ending with the Help button, and the Inbox menu has no Help item

### Requirement: A lead line shows whole or not at all
The lead line beside a compact header's title SHALL take the room the title and the actions leave, and SHALL be shown whole or not shown: it SHALL NOT be cut with an ellipsis. While hidden it SHALL NOT be announced or focusable. A lead line holding a control that is offered nowhere else (the calendar's Re-plan) SHALL keep its width and SHALL NOT be hidden. In a narrow header a project's lead line SHALL be the plain text the phone bar shows (progress, members and role, read-only, maintenance, public), with members and public links opened from Share in the project menu. The lead line of a day page (Today, Upcoming) wraps as before. This is presentation only and behaves the same offline.

#### Scenario: Room for the lead line
- **WHEN** the Inbox with three tasks to sort is open in a header with room beside the title
- **THEN** "3 to sort" shows in full

#### Scenario: No room for the lead line
- **WHEN** a project's header has less room beside the name than its lead line needs
- **THEN** the lead line is not shown, nothing in the header ends with an ellipsis except the name, and the header stays one row

#### Scenario: A lead line with a control
- **WHEN** the calendar's header shows "2 blocks behind · Re-plan"
- **THEN** the lead line keeps its width at every header width and Re-plan can be pressed
