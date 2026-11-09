## MODIFIED Requirements

### Requirement: One row anatomy
Every task list (Inbox, Today, Upcoming, Anytime, Someday, Assigned, Completed, projects, labels, filters, saved filters, dashboards, Trash, Next, Waiting, the review screens, Close the day) SHALL render tasks with the same row: a fixed 24 px leading slot (collapse chevron only when the task has children, otherwise empty), the checkbox, the time column (see "Time column"), the title with its marks beside it (the repeat mark and the counts: subtask progress, the notes marker, comments, attachments), the properties (see "Metadata language"), and a trailing group at the end of the row holding the origin. From 40 rem of row width the trailing group SHALL be one fixed width on every row of a list, with an origin or empty, so the right-hand column ends at the same place on every row whatever a row ends with; an origin longer than the group ends with an ellipsis, its whole text in its accessible name and the task's details. The layout SHALL follow the width of the row itself, not of the screen. The title SHALL use the width the row leaves it, wrap onto a second line when it is longer, and end with an ellipsis after two lines; on a very wide row it SHALL wrap at a readable measure of about 100 characters (48 rem). While the title is cut, a pointer resting on it SHALL show the whole title in a tooltip; the open control is named by the whole title at all times, and the task panel shows it in full. No room SHALL be kept at the row's end for controls that only appear on hover or focus. From 40 rem of row width a row SHALL be one line, or two while its title wraps: the title on the left and the properties in a right-hand column of fixed cells, in this order: the date, the project when the list shows projects, one cell holding the labels, else the deadline, else the subtask progress, the estimate, and the assignee; every row of a list SHALL use the same cell widths, so each property lines up down the list, and an empty cell keeps its width. As the row narrows the column SHALL drop cells from its end: under 56 rem the estimate and the assignee, and under 48 rem the third cell when the list shows projects; the task panel shows every property. Facts the column does not hold (the start, the deadline when the labels take its cell, blocked, the habit streak, field values, a parent's name, the sample mark) SHALL take a second line only when there are any. Under 40 rem of row width the properties and those facts SHALL form one metadata line under the title, except on a screen narrower than 768 px: there the row SHALL be one line at least 44 px tall, with the title at 14.5 px on one line ending with an ellipsis and one cell at its end, which is the date, else the deadline when it holds the third cell, else the assignee's avatar, else the project's marker alone; the project's and the assignee's names SHALL stay in the accessible text, and the other properties, the second line of facts and the counts SHALL be left to the task page. When a One line or Detailed row displays a project, the marker SHALL be its configured icon in its project colour, matching the sidebar symbol, or the project colour dot when no icon is set or the icon is unavailable. The marker SHALL be decorative. The checkbox SHALL sit at the same horizontal position in every flat view and at the same position plus indentation in tree views; within one list every title SHALL start at the same horizontal position. The counts SHALL be in the page and read by assistive technology at all times, at the faint text colour (still meeting text contrast) until the pointer is over the row or focus is inside it, then at the muted colour; they are not a control and SHALL NOT add a touch or tab target.

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
- **THEN** every row's date cell starts at the same horizontal position and so does every row's label cell, and at 390 px every row's date ends at the same position
