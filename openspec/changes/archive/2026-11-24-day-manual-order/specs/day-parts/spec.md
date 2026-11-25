## ADDED Requirements

### Requirement: Part of the day in the due order
While day parts are on, ordered by Due date, the tasks of one day SHALL be listed by part of the day, in the order Time of day groups them: tasks with neither a part nor a due time first, then Morning, Afternoon and This Evening, a task's part being its stored part or, without one, the part its due time falls in. Within a part, tasks with a due time SHALL come by time, then those without, then by the existing tie-breaks. This SHALL apply in Upcoming's days, in Today under every grouping and in Earlier (each day apart). In Upcoming, Manual order SHALL keep the part as the first key within a day. It SHALL apply only while day parts are on; with them off, the order SHALL be as before. The order is computed on the device without writes and follows synced changes live.

#### Scenario: Upcoming's Thursday
- **WHEN** day parts are on and Thursday holds an Evening task, an untimed task without a part, a Morning task without a time and a task due at 09:00
- **THEN** Upcoming lists the untimed task, the 09:00 task, the Morning task and the Evening task, in that order

#### Scenario: Today by project
- **WHEN** day parts are on, Today is grouped by Project and ordered by Due date, and "Work" holds a task due at 19:00 and a Morning task
- **THEN** "Work" lists the Morning task first

#### Scenario: Day parts off
- **WHEN** day parts are off
- **THEN** Upcoming orders Thursday's tasks by due date as before

## MODIFIED Requirements

### Requirement: Setting the part of the day
While day parts are on, the user SHALL be able to set a part in five ways:
- from the When popover's Do on segment, in its time of day row (Any time, Morning, Afternoon, Evening and Time as one segmented control, see `web-app` "Do on segment");
- by dragging or keyboard-moving a task onto a part's heading in Today;
- by dropping a task at a line between the rows of another part, in Today grouped by Time of day or in a day of Upcoming, which also places it there (OpenSpec `builtin-view-options` "Manual order of the day");
- from a "Day part…" submenu of the task Actions menu;
- from palette commands.

`Shift+E` SHALL keep toggling Evening. Each SHALL write the pairing of the Day part field requirement with Undo, offline included. Viewers SHALL see the part as text and get no control.

Only in the Do on segment's row, a part and a due time SHALL be exclusive:
- choosing a part SHALL also remove the due time and its zone in the same batch;
- choosing a time SHALL also write the Any time pairing.

Every other way of setting a part, and every other writer, SHALL leave the due time as it is. When a task holds both, the stored part SHALL keep winning over the time for placement.

#### Scenario: Drag to Afternoon
- **WHEN** the user drags a task from the Today group onto the Afternoon heading
- **THEN** the task is listed under Afternoon, Undo puts it back, and the other devices show it there after sync

#### Scenario: A timed task between two Afternoon rows
- **WHEN** a task due today at 09:00 is dropped at the line between two tasks under Afternoon
- **THEN** its `day_part` is `afternoon`, it keeps 09:00, it is listed between them, and one Undo restores its part and place

#### Scenario: Evening from the keyboard
- **WHEN** the user presses `Shift+E` on a Morning task
- **THEN** the task moves to This Evening and its `day_part` is null

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens a Morning task
- **THEN** the When line reads Morning and no part control is offered

#### Scenario: Morning in the Do on row clears the time
- **WHEN** a task due today at 14:00 is open and the user chooses Morning in the Do on segment's row
- **THEN** the task is due today without a time, its `day_part` is `morning` and `evening` false in one batch, it is listed under Morning, and one Undo restores 14:00 and Any time

#### Scenario: Shift+E keeps the time
- **WHEN** the user presses `Shift+E` on a task due today at 09:00
- **THEN** the task is Evening, keeps its 09:00 due time, and is listed under This Evening

#### Scenario: An older client reads the result
- **WHEN** the user chose Afternoon in the Do on row and a 1.0 client syncs the task
- **THEN** the 1.0 client shows the task as Afternoon without a due time
