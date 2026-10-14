# time-blocking Specification

## Purpose
Defines duration estimates on tasks and the time-blocking calendar: how estimates are entered and shown, how tasks are placed on a Day or Week grid by drag or keyboard, how overlaps and daily capacity are displayed, how lists filter by duration, and how all of it behaves offline and across devices.

## Requirements

### Requirement: Duration estimate field
A task SHALL have an optional `estimate_minutes` value, a positive integer of at most 10080 (one week). It SHALL be an additive field written through the operation log, editable offline and converging by last-writer-wins. Rows SHALL show it compactly (`15m`, `1h 30m`), and clearing it SHALL be possible.

#### Scenario: Set an estimate offline
- **WHEN** the device is offline and the user sets an estimate of 45 minutes
- **THEN** the row shows `45m` at once and the change is uploaded on the next successful sync

#### Scenario: Invalid estimate
- **WHEN** a client submits zero, a negative or fractional number, a string, or more than 10080
- **THEN** the write is rejected as invalid and the estimate is unchanged

#### Scenario: Concurrent estimate and due edits
- **WHEN** device A sets the estimate while device B moves the task to another time slot, both offline, and both sync
- **THEN** every device shows A's estimate and B's time, because they are separate fields

### Requirement: Estimate entry
The detail panel SHALL offer an estimate control that accepts shorthand (`15m`, `1h`, `1h30`, `90`) and presets (15, 30, 45, 60, 90, 120 minutes), reachable from the keyboard, and a shortcut on a selected row SHALL open it.

#### Scenario: Shorthand parsing
- **WHEN** the user types `1h30` and presses Enter
- **THEN** the estimate becomes 90 minutes

#### Scenario: Keyboard entry from the list
- **WHEN** a task is selected in a list and the user presses `e`
- **THEN** the estimate control opens focused for that task, and typing `20` then Enter sets 20 minutes

### Requirement: Day and Week calendar views
The client SHALL provide Day and Week views, reachable by `g d` and `g w`, showing a 15-minute grid from a configurable start to end hour (default 06:00 to 22:00, scrollable beyond). An open task with a due date and time SHALL appear as a block at that time, sized by its estimate, or by a 30-minute default rendered distinctly when unestimated. Tasks due that day without a time SHALL appear in an "unscheduled" lane above the grid. The views SHALL render from the local store and work offline.

#### Scenario: Open the week offline
- **WHEN** the device is offline and the user presses `g w`
- **THEN** the current week renders with every timed task as a block and date-only tasks in each day's lane

#### Scenario: Unestimated block
- **WHEN** a task due today at 10:00 has no estimate
- **THEN** it appears as a 30-minute block with a dashed outline and no duration label

#### Scenario: Completed tasks
- **WHEN** a task shown as a block is completed
- **THEN** it leaves the grid and the day's planned total decreases accordingly

### Requirement: Calendar follows the date and time preferences
The Week view SHALL start on the user's preferred first day of the week (OpenSpec `date-time-preferences`), and grid hours and block times SHALL follow the user's time format.

#### Scenario: Week starts on the preferred day
- **WHEN** the first day of the week is `sun`, today is Wednesday 2026-10-14 and the user presses `g w`
- **THEN** the week shown runs from Sunday 2026-10-11 to Saturday 2026-10-17

#### Scenario: Grid hours in 12-hour format
- **WHEN** the time format is `12h`
- **THEN** the grid's hour labels read `9 AM`, `10 AM` and so on, and moving a block still sets the same stored `HH:MM` due time

### Requirement: Place and resize blocks
Dragging a task from the unscheduled lane, from any list or from an existing block onto a grid slot SHALL set its due date and time to that slot; dragging a block's lower edge SHALL set its estimate in 15-minute steps. Dropping on the unscheduled lane SHALL keep the date and clear the time. Each action SHALL be an ordinary field edit: applied locally first, queued offline, converging by last-writer-wins.

#### Scenario: Drop on a slot
- **WHEN** the user drags a task onto Tuesday 14:30
- **THEN** the task's due becomes Tuesday at 14:30 immediately and the block appears there

#### Scenario: Resize
- **WHEN** the user drags the bottom edge of a 30-minute block down two rows
- **THEN** the estimate becomes 60 minutes

#### Scenario: Two devices move the same block
- **WHEN** device A moves a task to 09:00 and device B moves it to 11:00, both offline, and both sync
- **THEN** every device shows the task at the time written with the greater timestamp

### Requirement: Keyboard equivalent for every placement
With a block or lane task selected, arrow keys SHALL move it by 15 minutes or one day, `Shift` with up and down SHALL change the estimate by 15 minutes, Enter SHALL open the detail panel, and a shortcut SHALL send a selected list task to the Day view's placement mode. No placement SHALL require a pointer.

#### Scenario: Move with arrows
- **WHEN** a block at 09:00 is selected and the user presses the down arrow twice
- **THEN** the task is due at 09:30

#### Scenario: Schedule from a list
- **WHEN** a task is selected in Today and the user presses `s`
- **THEN** the Day view opens with that task in placement mode, arrows pick a slot and Enter confirms

### Requirement: Overlap and capacity
Blocks that overlap in time SHALL be laid out side by side without hiding each other and SHALL carry an overlap marker. Each day column SHALL show the sum of estimates of its open timed and untimed tasks against a configurable day length (default 8 hours) and SHALL mark the day when the sum exceeds it.

#### Scenario: Two tasks at the same time
- **WHEN** two tasks are due today at 10:00
- **THEN** both blocks are visible side by side with the overlap marker

#### Scenario: Over capacity
- **WHEN** today's open tasks total 9 hours of estimates with an 8-hour day length
- **THEN** the day header shows `9h / 8h` marked as over capacity

### Requirement: Duration filter
Inbox, Today, Upcoming and project views SHALL offer a duration filter with "Quick wins" (15 minutes or less), "Under 30 min", "Over 1 h" and "Unestimated". The filter SHALL apply to the local data, persist per device across reloads, and use one duration predicate that later filter features can reuse.

#### Scenario: Quick wins
- **WHEN** the user turns on "Quick wins" in Today
- **THEN** only open tasks with an estimate of 15 minutes or less remain, and the active filter is visible with a way to clear it

#### Scenario: Filter persists offline
- **WHEN** the device is offline, a filter is active and the page is reloaded
- **THEN** the same filter is still active

### Requirement: Grid preferences
Start hour, end hour and day length SHALL be per-device preferences editable in Settings, with defaults that need no setup, and SHALL not be synced.

#### Scenario: Change day length
- **WHEN** the user sets the day length to 6 hours in Settings
- **THEN** capacity markers on this device use 6 hours and other devices are unaffected
