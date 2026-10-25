# row-layouts Specification

## Purpose
Defines the two task row layouts, One line and Detailed, the priority mark that never relies on colour alone, and where the layout is chosen: for the account in Settings and per view, project or label in Display options.

## Requirements

### Requirement: One-line and detailed rows
A list row SHALL have one of two layouts. **One line** (the default) SHALL be the Precision row of `task-list-presentation`, unchanged apart from the priority mark. **Detailed** SHALL show the title (wrapping to two lines at most), then the parent task's name when the task is shown outside its parent's subtree, then one details line with, where set and not hidden by the list's display options: the do date with its time, the priority mark with its text, the deadline, the start, the project with its colour dot, the estimate, the assignee and the other facts of the row, and the labels on one line with as many chips as the row's width holds followed by "+n" for the rest, every name read by assistive technology and listed in a tooltip. The details line SHALL wrap at a narrow width and at a large text size instead of cutting values off, and a detailed row SHALL have no time column (its time is in the details line). The do date SHALL show in both layouts wherever the row shows it today. Board cards and the compact rows of the Plan and the calendar SHALL keep their own shapes.

#### Scenario: Detailed row of a subtask in Today
- **WHEN** Detailed is on and Today lists "Book flights", a priority-2 subtask of "Plan trip" due today at 09:30 with the labels "call", "errand" and "waiting"
- **THEN** the row shows "Book flights", then "Plan trip", then a line with "09:30", the two-bar mark with "P2" and the three label chips

#### Scenario: Labels that do not fit
- **WHEN** a detailed row has five labels and room for two
- **THEN** two chips are shown followed by "+3", and a screen reader reads all five names

#### Scenario: Phone with a large text size
- **WHEN** Detailed is on and the text size is 125% on a 390 px screen
- **THEN** each row's details wrap onto further lines and no value is cut off except long names, which end in an ellipsis

### Requirement: Priority is never colour alone
A row of an open task with priority 1, 2 or 3 SHALL show a priority mark in the priority's colour and with a distinct shape per level: three bars for priority 1, two for priority 2, one for priority 3, drawn with the icon set; priority 4, the default, has none. On a one-line row the mark SHALL follow the title and be read as "Priority n"; on a detailed row it SHALL be followed by the text "P1", "P2" or "P3". The checkbox ring SHALL keep its colours.

#### Scenario: One-line row
- **WHEN** a list shows a priority-1 task and a priority-4 task on one-line rows
- **THEN** the first row shows three bars after its title, read as "Priority 1", and the second shows no mark

### Requirement: Where the row layout is chosen
The account SHALL have one row layout, set in Settings › Appearance as "Task rows" (One line or Detailed), stored in the user's synced preferences and used by every list without its own choice: Today, Upcoming, the Inbox, search results and the other built-in lists, and every view, project or label that has not chosen. A saved view, the New view page, a project's list and a label's page SHALL offer One line and Detailed in their display panel, showing the layout in use; a choice SHALL be stored on the view, in the user's personal preferences of the project or on the label, apply at once and win over the account's. Every choice SHALL be an operation written locally first, working offline and converging per field by last writer wins. An empty or unknown stored value SHALL read as the account's layout (for the account itself, One line) and SHALL not be rewritten.

#### Scenario: Account choice
- **WHEN** the user picks Detailed under Settings › Appearance › Task rows on the laptop
- **THEN** Today and the Inbox show detailed rows on the laptop at once and on the phone after sync, and a project without its own choice does too

#### Scenario: A project's own choice
- **WHEN** the account uses Detailed and the user picks One line in the display options of the project "Home"
- **THEN** "Home" shows one-line rows and the other lists stay detailed

#### Scenario: Unknown value
- **WHEN** a newer client stores a row layout this version does not know on a view
- **THEN** this version shows the view in the account's layout and leaves the stored value unchanged
