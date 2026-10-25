## MODIFIED Requirements

### Requirement: Place and resize blocks
Dragging a task from the unscheduled lane, from any list or from an existing block onto a grid slot SHALL set its due date and time to that slot, keeping its estimate; dragging a block's lower edge SHALL set its estimate in 15-minute steps; dragging a block's upper edge SHALL set its due time in 15-minute steps and its estimate to the time left until the block's unchanged end (at least 15 minutes; a block without an estimate counts as its drawn 30 minutes), as one change offered with Undo. The upper and lower edges SHALL take the same hit size, with the mouse and with a long press on touch, in Day and Week. Dropping on the unscheduled lane SHALL keep the date and clear the time. Each action SHALL be an ordinary field edit: applied locally first, queued offline, converging by last-writer-wins. A time fixed to a zone SHALL stay fixed to that zone. Events of subscribed calendars stay read-only.

#### Scenario: Drop on a slot
- **WHEN** the user drags a task onto Tuesday 14:30
- **THEN** the task's due becomes Tuesday at 14:30 immediately and the block appears there

#### Scenario: Resize
- **WHEN** the user drags the bottom edge of a 30-minute block down two rows
- **THEN** the estimate becomes 60 minutes

#### Scenario: Two devices move the same block
- **WHEN** device A moves a task to 09:00 and device B moves it to 11:00, both offline, and both sync
- **THEN** every device shows the task at the time written with the greater timestamp

#### Scenario: Start earlier from the upper edge
- **WHEN** the user drags the top edge of a 10:00 block with a 60-minute estimate up to 09:30
- **THEN** the task is due at 09:30 with a 90-minute estimate, the block still ends at 11:00, and one Undo puts back both

#### Scenario: Start later, never shorter than a slot
- **WHEN** the user drags the top edge of a 10:00 block without an estimate down past its end
- **THEN** the task is due at 10:15 with a 15-minute estimate

#### Scenario: Move keeps the length
- **WHEN** the user drags the middle of a 10:00 block with a 60-minute estimate to 13:00
- **THEN** the task is due at 13:00 and its estimate is still 60 minutes

### Requirement: Keyboard equivalent for every placement
With a block or lane task selected, arrow keys SHALL move it by 15 minutes or one day, `Shift` with up and down SHALL change the estimate by 15 minutes, `Alt`+`Shift` with up and down SHALL move the start by 15 minutes keeping the end, Enter SHALL open the detail panel, and a shortcut SHALL send a selected list task to the Day view's placement mode. No placement SHALL require a pointer.

#### Scenario: Move with arrows
- **WHEN** a block at 09:00 is selected and the user presses the down arrow twice
- **THEN** the task is due at 09:30

#### Scenario: Schedule from a list
- **WHEN** a task is selected in Today and the user presses `s`
- **THEN** the Day view opens with that task in placement mode, arrows pick a slot and Enter confirms

#### Scenario: Start earlier with the keyboard
- **WHEN** a 10:00 block with a 60-minute estimate is selected and the user presses `Alt`+`Shift`+up
- **THEN** the task is due at 09:45 with a 75-minute estimate
