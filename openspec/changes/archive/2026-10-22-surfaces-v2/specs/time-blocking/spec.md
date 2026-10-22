# Spec Delta

## MODIFIED Requirements

### Requirement: Tasks as calendar blocks
An open task with a due date and time SHALL appear as a block at that time, sized by its estimate, or by a 30-minute default rendered distinctly when unestimated. Tasks due that day without a time SHALL appear in an "unscheduled" lane above the grid. A task block SHALL be drawn as a soft fill of its project's palette hue (the Inbox hue for a task without a project) with a 3 px edge of the solid hue on its leading side and the strong text tone for its title, never as a white box with a coloured border; its edge SHALL meet 3:1 against the grid. A block on a day before today, and a block whose task is a completed occurrence shown by a view, SHALL be dimmed to the faint tone with its fill lightened, so the past reads as past at a glance. Today's grid SHALL carry one now line across its column at the current time, updated while the view is open, and no other day SHALL carry one. The selected block SHALL keep the accent ring as the one selection style.

#### Scenario: Unestimated block
- **WHEN** a task due today at 10:00 has no estimate
- **THEN** it appears as a 30-minute block with a dashed edge and no duration label, and its tooltip explains the dashed edge and offers Set estimate

#### Scenario: Completed tasks
- **WHEN** a task shown as a block is completed
- **THEN** it leaves the grid and the day's planned total decreases accordingly

#### Scenario: Capacity as a bar
- **WHEN** a day has 2 h 50 planned of 8 h with five unestimated tasks
- **THEN** the lane shows a capacity bar whose tooltip reads "2 h 50 of 8 h planned · 5 tasks without estimate"

#### Scenario: Filled block in the project hue
- **WHEN** a task of the blue project "Work" is due today at 14:00 with a 1 h estimate
- **THEN** its block has the blue soft fill, a 3 px solid blue edge on the left and the title in the strong text tone, in light and in dark

#### Scenario: Yesterday is dimmed
- **WHEN** the Week shows yesterday with two open timed tasks
- **THEN** both blocks are drawn in the faint tone with a lightened fill, today's blocks are not, and both remain draggable and keyboard-movable as before

#### Scenario: Now line on today only
- **WHEN** the Week is open at 10:17
- **THEN** today's column shows a line at 10:17 that moves as time passes, and the other six columns show none

### Requirement: Overlap and capacity
Blocks that overlap in time SHALL be laid out side by side without hiding each other and SHALL carry an overlap marker. Each day column SHALL show the sum of estimates of its open timed and untimed tasks against a configurable day length (default 8 hours) and SHALL mark the day when the sum exceeds it. The capacity line SHALL be set in the muted text tone with tabular figures of the interface typeface, and SHALL turn to the danger tone with the over-capacity text when the day is over capacity; it SHALL never use a monospace face. Blocks of subscribed calendar events (OpenSpec `calendar-feeds`) SHALL take part in the side-by-side layout and the marker, and SHALL NOT count toward the sum.

#### Scenario: Two tasks at the same time
- **WHEN** two tasks are due today at 10:00
- **THEN** both blocks are visible side by side with the overlap marker

#### Scenario: Over capacity
- **WHEN** today's open tasks total 9 hours of estimates with an 8-hour day length
- **THEN** the day header shows `9h / 8h` in the danger tone, marked as over capacity

#### Scenario: Capacity line at rest
- **WHEN** today's open tasks total 2 hours of estimates with an 8-hour day length
- **THEN** the day header shows `2h / 8h` in the muted tone with tabular figures, so the figures of neighbouring days line up

#### Scenario: Task during a meeting
- **WHEN** a subscribed calendar has a meeting 10:00 to 11:00 and a 30-minute task is due today at 10:00
- **THEN** the task block and the event block are drawn side by side with the overlap marker, and the day header counts only the task's 30 minutes

#### Scenario: Calendars hidden
- **WHEN** the user hides calendars on this device
- **THEN** task blocks are laid out as if no events existed and the header is unchanged
