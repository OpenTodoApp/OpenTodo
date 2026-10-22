## MODIFIED Requirements

### Requirement: Select with a pointer or on touch
Each row SHALL show a selection checkbox whenever any row is ticked; it SHALL NOT appear on hover or on the cursor row alone. With a pointer, `Ctrl`/`⌘`+click on a row SHALL tick it without opening it and Shift+click SHALL select the range from where ticking started. On a touch screen a long press on a row SHALL tick it, show the checkboxes on every row and the selection bar, and give one short haptic pulse where the device supports it; "Select tasks" in the page's overflow menu SHALL show the checkboxes without ticking a row. A long press on a row that is already ticked, followed by movement, SHALL start the drag of the selection as before. The checkboxes SHALL stay shown until Done in the selection bar, or until the selection is cleared or used. Checkboxes SHALL be at least 48×48 px on touch screens and announce their state. Selection is device state and never an operation; it works offline and is never synced.

#### Scenario: Range by Shift+click
- **WHEN** the user `Ctrl`+clicks the first row and Shift+clicks the fifth row
- **THEN** rows one to five are ticked and none opens

#### Scenario: Hover does not offer selection
- **WHEN** nothing is ticked and the user points at a row and clicks its round checkbox
- **THEN** the task is completed and nothing is ticked

#### Scenario: Long press starts a selection
- **WHEN** a user on a phone presses and holds a row without moving, then lifts
- **THEN** the row is ticked, every row shows its checkbox, the selection bar appears, and the task did not open

#### Scenario: Touch selection mode
- **WHEN** a user on a phone chooses "Select tasks" in the bar's overflow, ticks two rows and taps Done
- **THEN** the checkboxes hide again, the two rows stay ticked and the bar stays shown until the selection is cleared or used

#### Scenario: Hold and move drags the selection
- **WHEN** two rows are ticked and the user presses and holds one of them, then moves the finger
- **THEN** the drag of both tasks starts, as it did before this change, and no third row is ticked
