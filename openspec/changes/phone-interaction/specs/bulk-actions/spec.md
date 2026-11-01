## ADDED Requirements

### Requirement: A tap ticks a row in Select mode
While "Select tasks" is on, a tap anywhere on a row (its title, its facts or the empty part of the row) SHALL tick or untick that row through the same path as Shift and Ctrl/⌘ clicks, and SHALL NOT open the task. The checkbox SHALL keep ticking its row, the disclosure control SHALL keep showing the details, and a drag or swipe SHALL keep its own meaning. With Select mode off a tap SHALL open the task as before, and on a fine pointer Select mode is not offered. Selection stays device state and is never synced.

#### Scenario: A tap on the title ticks it
- **WHEN** a user on a phone turns on "Select tasks" and taps a row's title
- **THEN** the row is ticked, the selection bar appears, and no task panel or page opens

#### Scenario: A tap on the bare row ticks it
- **WHEN** Select mode is on and the user taps the space beside a row's title, and taps the title of the same row again
- **THEN** the first tap ticks the row and the second unticks it, with nothing opened

#### Scenario: The checkbox and the details still work
- **WHEN** Select mode is on and the user taps a row's checkbox or its disclosure control
- **THEN** the checkbox ticks the row and the disclosure shows its details, as with Select mode off

#### Scenario: Off, a tap opens the task
- **WHEN** the user taps Done and then taps a row
- **THEN** the task opens as before
