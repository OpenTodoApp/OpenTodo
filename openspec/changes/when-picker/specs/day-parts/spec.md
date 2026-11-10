## MODIFIED Requirements

### Requirement: Setting the part of the day
While day parts are on, the user SHALL be able to set a part in four ways:
- from the When popover's Do on segment, in its time of day row (Any time, Morning, Afternoon, Evening and Time as one segmented control, see `web-app` "Do on segment");
- by dragging or keyboard-moving a task onto a part's heading in Today;
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
