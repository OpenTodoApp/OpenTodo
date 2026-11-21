# Spec Delta

## MODIFIED Requirements

### Requirement: One row anatomy
Every task list (Inbox, Today, Upcoming, Anytime, Someday, Assigned, Completed, projects, labels, filters, saved filters, dashboards, Trash, Next, Waiting, the review screens, Close the day) SHALL render tasks with the same row: a fixed 24 px leading slot (collapse chevron only when the task has children, otherwise empty), the checkbox, the time column (see "Time column"), the title with its marks beside it (the repeat mark and the counts: subtask progress, the notes marker, comments, attachments), the properties (see "Metadata language"), and a trailing group at the end of the row holding the origin. From 40 rem of row width the trailing group SHALL be one fixed width on every row of a list, with an origin or empty, so the right-hand column ends at the same place on every row whatever a row ends with; an origin longer than the group ends with an ellipsis, its whole text in its accessible name and the task's details. The layout SHALL follow the width of the row itself, not of the screen. The title SHALL use the width the row leaves it, wrap onto a second line when it is longer, and end with an ellipsis after two lines; on a very wide row it SHALL wrap at a readable measure of about 100 characters (48 rem). While the title is cut, a pointer resting on it SHALL show the whole title in a tooltip; the open control is named by the whole title at all times, and the task panel shows it in full. No room SHALL be kept at the row's end for controls that only appear on hover or focus. From 40 rem of row width a row SHALL be one line, or two while its title wraps: the title on the left and the properties in a right-hand column of fixed slots, in this order: the project when the list shows projects, the labels, the estimate, the date, and the assignee when the list holds shared tasks. Each slot SHALL hold one kind of fact only, and the date slot SHALL end the column, so the dates of a list form its right edge. Every row of a list SHALL use the same slot widths, so each property lines up down the list. A slot that is empty on a row SHALL keep its width, and a slot that no row of the list uses SHALL take no width, decided once for the whole list from its rows, not from the rows in view. The slot widths SHALL be the same in the Comfortable and Compact densities. As the row narrows the column SHALL drop slots, never the date: under 56 rem the estimate and the assignee, and under 48 rem the labels when the list shows projects; the task panel shows every property. Facts the column does not hold (the start, the deadline when the time column does not hold it, blocked, the habit streak, field values, a parent's name, the sample mark) SHALL take a second line only when there are any. Under 40 rem of row width the properties and those facts SHALL form one metadata line under the title, except on a screen narrower than 768 px: there the row SHALL be its title at 14.5 px, on one line when it fits and on two when it is longer, ending with an ellipsis after two as on every other row, and one cell at its end, which is the date, else the deadline, else the assignee's avatar, else the project marker alone. That row SHALL be at least 44 px tall and grow by the title's second line only; its checkbox, time, marks, end cell, disclosure and grip SHALL stay on the title's first line at the same positions and sizes as on a one-line row; the project's and the assignee's names SHALL stay in the accessible text, and the other properties, the second line of facts and the counts SHALL be left to the task page. The checkbox SHALL sit at the same horizontal position in every flat view and at the same position plus indentation in tree views; within one list every title SHALL start at the same horizontal position. The counts SHALL be in the page and read by assistive technology at all times, at the faint text colour (still meeting text contrast) until the pointer is over the row or focus is inside it, then at the muted colour; they are not a control and SHALL NOT add a touch or tab target. When a One line or Detailed row displays a project, the marker SHALL be its configured icon in its project colour, matching the sidebar symbol, or the project colour dot when no icon is set or the icon is unavailable. The marker SHALL be decorative.

#### Scenario: Same alignment across views
- **WHEN** the user moves between Today, the Inbox and a project without sections
- **THEN** the checkboxes of top-level tasks are at the same horizontal position in all three

#### Scenario: Titles align within a list
- **WHEN** Today lists a task due at 10:00 and a task with no time
- **THEN** both titles start at the same horizontal position, the first row's time in the column and the second row's column empty

#### Scenario: Single-line rows
- **WHEN** a task has no date, labels, estimate, subtasks, comments or attachments, or a list row is at least 40 rem wide and the task has only properties the column holds
- **THEN** its row is one line tall

#### Scenario: Counts on demand
- **WHEN** a task has 2 of 3 subtasks done and 3 comments
- **THEN** "2/3" and "3" are beside the title in the faint text colour, become the muted text colour while the pointer is over the row or its open control has focus, and a screen reader hears "2 of 3 subtasks completed" and "3 comments" either way

#### Scenario: Project at the row's end
- **WHEN** Upcoming lists a task of the project "Home renovation", which has a house icon, on a 1280 px screen
- **THEN** "Home renovation" is muted text with its configured icon in the project colour in the project cell of the right-hand column, aligned with the project of every other row, and on a 390 px screen a row with no date and no assignee ends with its icon alone, its name read by a screen reader

#### Scenario: Project in Detailed rows
- **WHEN** a Detailed row shows the project and the project has a configured icon
- **THEN** the icon and project name appear together in its metadata, and the icon adds no extra accessible name or control

#### Scenario: Project icon unavailable
- **WHEN** a task row shows a project whose icon is unset, unknown to this device, or not yet loaded
- **THEN** the row shows the project's colour dot in the same place, using the locally available project data without changing it

#### Scenario: Counts on a touch screen
- **WHEN** the same row is shown on a 1024 px tablet without hover
- **THEN** the counts are shown at low contrast, still readable, and no extra tap target exists

#### Scenario: One line on a phone
- **WHEN** Today lists "Call the plumber about the boiler", assigned to Mia Lang in the project "Home renovation", on a 390×844 phone
- **THEN** the row is one line 44 px tall, the title at 14.5 px is followed by Mia Lang's avatar at the row's end, the project and the counts are not on the row, and a screen reader still hears "Mia Lang"

#### Scenario: Two lines on a phone
- **WHEN** Today lists "Get three quotes for the kitchen" at 10:00 with priority 2 on a 360 px phone
- **THEN** the title reads in full on two lines, the row is 64 px tall, and the time, the checkbox, the priority mark, Show details and the grip are where they are on a one-line row, each touch target still at least 44 × 44 px

#### Scenario: A title longer than two lines on a phone
- **WHEN** the Inbox lists "Paint the fence along the garden path before the neighbours come over" on a 360 px phone
- **THEN** the row shows the title's first two lines ending with an ellipsis, its source line under them, and a screen reader hears the whole title as the row's name

#### Scenario: A long list of two-line rows on a phone
- **WHEN** the user presses End, or drags the scroll bar to its end, in a project of 2,000 tasks with long titles on a phone
- **THEN** the list reaches its last task, and swiping a two-line row, dragging it by its grip and completing it work as on a one-line row

#### Scenario: The date wins on a phone
- **WHEN** a task due two days ago with a label, an estimate and a project is listed in Today's Earlier group on a 390 px phone
- **THEN** its row ends with the date in the danger tone and shows no label, estimate or project

#### Scenario: A narrow list on a wide screen
- **WHEN** a list narrower than 40 rem is shown beside other content on a 1280 px screen
- **THEN** its rows keep the metadata line under the title

#### Scenario: A long title on a medium window
- **WHEN** the Inbox lists "Email cutting board company (Babylonian Woodworks) about the warped board and the replacement they promised" in a 960 px window with a mouse
- **THEN** the title runs to the row's right end on two lines with no empty area beside it, and the row's height is the same with the pointer over it

#### Scenario: A title longer than two lines
- **WHEN** a task's title needs four lines at the row's width
- **THEN** the row shows its first two lines ending with an ellipsis, resting the pointer on the title shows the whole title in a tooltip, and a screen reader hears the whole title as the row's name

#### Scenario: Properties on the first line
- **WHEN** a list row 60 rem wide holds a task due tomorrow whose title takes two lines
- **THEN** "Tomorrow" stands in the date cell on the title's first line, aligned with the dates of the one-line rows

#### Scenario: Columns line up with and without an origin
- **WHEN** a project list at 1280 or 768 px holds tasks imported from Todoist, a task from a GitHub issue, a task captured from a page, a Trello card and a task without an origin, each with a date and a label
- **THEN** every row's date slot starts at the same horizontal position and so does every row's labels slot, and at 390 px every row's date ends at the same position

#### Scenario: Slots line up when values are missing
- **WHEN** a project list at 1280 px holds one task with a label, an estimate and a date, one with only a date, and one with only a label
- **THEN** the three dates (where set) end at the row's right edge one under the other, the label chips start at the same position, and the empty slots keep their width

#### Scenario: A slot no row uses
- **WHEN** no task of a list has an estimate
- **THEN** the estimate slot takes no width on any row of that list, and the dates still end at the same position

#### Scenario: Compact density keeps the slots
- **WHEN** the user switches the density to Compact
- **THEN** the rows get shorter and every slot keeps its horizontal position
