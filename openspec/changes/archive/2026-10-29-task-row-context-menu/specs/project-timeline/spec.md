# Spec Delta

## MODIFIED Requirements

### Requirement: Timeline on narrow screens
Below 640 px the row labels SHALL stay visible while the axis scrolls horizontally, bars SHALL remain draggable by touch — a press and hold arms the drag with held feedback and the movement after it drags, where a movement before the hold is a scroll — and the page SHALL not scroll horizontally as a whole.

#### Scenario: Phone layout
- **WHEN** the timeline is opened at 360 px width
- **THEN** task names stay in view while the axis scrolls, and the layout check reports no horizontal overflow

#### Scenario: Press, hold, then move drags a bar
- **WHEN** a user on a touch screen presses a bar, holds still past the hold interval and then moves
- **THEN** the bar drags with its usual feedback, and a movement before the hold elapsed only scrolled the view
