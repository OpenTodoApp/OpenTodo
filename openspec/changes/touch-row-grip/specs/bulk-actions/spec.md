## MODIFIED Requirements

### Requirement: Select with a pointer or on touch
Each row SHALL show a selection checkbox whenever any row is ticked; it SHALL NOT appear on hover or on the cursor row alone. With a pointer, `Ctrl`/`⌘`+click on a row SHALL tick it without opening it and Shift+click SHALL select the range from where ticking started. On a touch screen, selection lives on the row's grip — a marker at the row's right edge, shown only where a coarse pointer is the primary one — and the row body's own long press SHALL not tick anything (it is the actions menu's gesture; see action-menus). A tap on the grip SHALL tick the row (or untick it when it is already ticked), show the checkboxes on every row and the selection bar, and give one short haptic pulse where the device supports it; holding the grip still for the hold interval SHALL do the same, and SHALL be idempotent on a row that is already ticked. Movement on the grip SHALL start the drag immediately — a grip is never a scroll — dragging the whole ticked selection once the press is on a ticked row, with the usual lift feedback. "Select tasks" in the page's overflow menu SHALL show the checkboxes without ticking a row. The row body's press SHALL arm during the hold interval with held feedback on the row, and a long press on a row that is already ticked SHALL arm without ticking anything new; a long press on a row that is already ticked, followed by movement, SHALL start the drag of the selection once the hold has elapsed: movement before the hold is a scroll, and the drag lifts only on movement after it, never under a still finger. The checkboxes SHALL stay shown until Done in the selection bar, or until the selection is cleared or used. Checkboxes SHALL be at least 48×48 px on touch screens and announce their state, and the box SHALL occupy the same 20 px control slot as the completion circle it stands in for, drawn by the app rather than by the platform's native control, so its alignment is identical on every device. Selection is device state and never an operation; it works offline and is never synced.

#### Scenario: Range by Shift+click
- **WHEN** the user `Ctrl`+clicks the first row and Shift+clicks the fifth row
- **THEN** rows one to five are ticked and none opens

#### Scenario: Hover does not offer selection
- **WHEN** nothing is ticked and the user points at a row and clicks its round checkbox
- **THEN** the task is completed and nothing is ticked

#### Scenario: A tap on the grip starts a selection
- **WHEN** a user on a phone taps the marker at a row's right edge
- **THEN** the row is ticked, every row shows its checkbox, the selection bar appears, one haptic pulse fires, and the task did not open

#### Scenario: Long press starts a selection
- **WHEN** a user on a phone presses the row's grip and holds it still past the hold interval, then lifts
- **THEN** the row is ticked, every row shows its checkbox, the selection bar appears, one haptic pulse fires, and the task did not open

#### Scenario: The row body's long press never ticks
- **WHEN** a user on a phone holds the body of a row still past the hold interval
- **THEN** no row is ticked and no checkbox appears — the hold opens the row's actions menu instead (action-menus)

#### Scenario: Touch selection mode
- **WHEN** a user on a phone chooses "Select tasks" in the bar's overflow, ticks two rows and taps Done
- **THEN** the checkboxes hide again, the two rows stay ticked and the bar stays shown until the selection is cleared or used

#### Scenario: Hold and move drags the selection
- **WHEN** two rows are ticked and the user presses and holds one of them, waits for the hold to elapse, then moves the finger
- **THEN** the drag of both tasks starts with its usual feedback, as it did before this change, and no third row is ticked

#### Scenario: The grip drags at once
- **WHEN** a user on a phone presses a row's grip and moves it past the drag threshold without waiting for the hold
- **THEN** the drag lifts immediately — the grip never scrolls — carrying the ticked selection when the pressed row is ticked, and the row body is untouched

#### Scenario: A move before the hold is a scroll
- **WHEN** a user on a phone presses a row's body and moves past the drag threshold before the hold interval elapses
- **THEN** the page scrolls (or the swipe runs), the row is not ticked and no drag starts

#### Scenario: The checkbox sits in the row's control slot on every device
- **WHEN** a phone user enters Select mode and compares a row's selection box with where its completion circle sits
- **THEN** the box is centred in the same 20 px slot, at the same size, with no platform-specific offset
