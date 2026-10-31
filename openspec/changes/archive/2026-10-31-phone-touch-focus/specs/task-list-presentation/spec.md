## ADDED Requirements

### Requirement: Checkbox touch target
On a coarse pointer a task row's checkbox SHALL take taps within a square of at least 44 × 44 px around its circle, above the row's other parts, without changing the circle's visible size or the row's height, on every row that shows a checkbox (lists, Today, board cards, the Daily check and the Loop home).

#### Scenario: Slightly off tap
- **WHEN** at 390 px on a touch screen the user taps 8 px to the right of a task's circle on Today
- **THEN** the task is completed and the task does not open

#### Scenario: Row while animated
- **WHEN** the row's title is moving (the first-visit swipe hint) and the user taps 8 px outside the circle
- **THEN** the tap still completes the task
