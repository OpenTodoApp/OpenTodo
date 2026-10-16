## MODIFIED Requirements

### Requirement: Select with a pointer or on touch
Each row SHALL show a selection checkbox whenever any row is ticked; it SHALL NOT appear on hover or on the cursor row alone. With a pointer, `Ctrl`/`⌘`+click on a row SHALL tick it without opening it and Shift+click SHALL select the range from where ticking started; on devices without hover a Select button in the list header SHALL show the checkboxes on every row until Done. Checkboxes SHALL be at least 44×44 px on touch screens and announce their state.

#### Scenario: Range by Shift+click
- **WHEN** the user `Ctrl`+clicks the first row and Shift+clicks the fifth row
- **THEN** rows one to five are ticked and none opens

#### Scenario: Hover does not offer selection
- **WHEN** nothing is ticked and the user points at a row and clicks its round checkbox
- **THEN** the task is completed and nothing is ticked

#### Scenario: Touch selection mode
- **WHEN** a user on a phone taps Select, ticks two rows and taps Done
- **THEN** the checkboxes hide again, the two rows stay ticked and the bar stays shown until the selection is cleared or used
