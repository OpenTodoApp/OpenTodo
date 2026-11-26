## MODIFIED Requirements

### Requirement: Timeline on narrow screens
Below 768 px a task's row SHALL be its name on one line across the width of the grid with its bar under it, instead of a name column beside the grid: the name SHALL stay at the grid's left edge while the axis scrolls horizontally, and the grid SHALL have the timeline's whole width. The bar SHALL NOT repeat the name there. Such a row SHALL be at least 44 px tall, the whole row SHALL be the control that carries the task's name, and no two names SHALL share a touch area. From 768 px the names stay beside the grid, and on a touch screen a row there SHALL be at least 44 px tall.

On a touch screen a tap on a task's name or on its bar SHALL open the task; with a mouse a click on either selects the row and a double click opens it, at every width. Bars SHALL remain draggable by touch — a press and hold arms the drag with held feedback and the movement after it drags, where a movement before the hold is a scroll — and a hold released without a movement, or a drag, SHALL NOT open the task. Group bars, the today line and its mark, dependency arrows and the notes after bars SHALL be drawn as at wider widths, the arrows between the bars. The page SHALL not scroll horizontally as a whole.

The hint above the grid SHALL keep its sentence about dragging on every device, and its sentence about keys SHALL only be drawn where a key can be pressed (keyboard hints on touch devices).

The layout is drawn from local data and writes nothing, so it is the same offline; opening a task and dragging a bar behave as "Reschedule from the timeline" states.

#### Scenario: Phone layout
- **WHEN** the timeline is opened at 360 px width with a task named "Kitchen cabinets and the counter top"
- **THEN** the whole name is on one line above the task's bar, it stays in view while the axis scrolls, about ten days of the axis are visible, and the layout check reports no horizontal overflow

#### Scenario: Rows fit a finger
- **WHEN** the timeline is opened on a phone with five unscheduled tasks in a row
- **THEN** each row is at least 44 px tall and no two names' touch areas overlap

#### Scenario: Tap a name
- **WHEN** a user on a phone taps a task's name on the timeline
- **THEN** the task opens

#### Scenario: Tap a bar
- **WHEN** a user on a phone taps a task's bar on the timeline
- **THEN** the task opens, as it does from its name, and none of its dates change

#### Scenario: Click a bar with a mouse
- **WHEN** a user with a mouse clicks a task's bar
- **THEN** its row is selected and the task does not open until a double click or Enter

#### Scenario: Press, hold, then move drags a bar
- **WHEN** a user on a touch screen presses a bar, holds still past the hold interval and then moves
- **THEN** the bar drags with its usual feedback and the task does not open on release, and a movement before the hold elapsed only scrolled the view

#### Scenario: Touch screen from 768 px
- **WHEN** the timeline is opened on a 768 px wide touch screen
- **THEN** the names stay in their column beside the grid and each row is 44 px tall

#### Scenario: Hint without keys on a phone
- **WHEN** an editor opens the timeline on a phone with no keyboard
- **THEN** the hint reads "Drag a bar to move its dates, or its ends to set the start and deadline." and says nothing about arrow keys

#### Scenario: Unchanged with a mouse
- **WHEN** the timeline is opened at 1280 px with a mouse
- **THEN** rows are 36 px with the names in a column beside the grid, a click on a name selects its row, and the hint also names the arrow keys

## ADDED Requirements

### Requirement: A bar's ends by touch
A touch press on a bar SHALL drag the task's start when it lands within 24 px of the bar's left end and its deadline when it lands within 24 px of its right end, and SHALL move the whole bar from anywhere between. Each end's zone SHALL be at most a third of the bar's width, so the middle third of a bar shorter than 72 px still moves it. An end of a bar that runs past the axis SHALL have no zone. The pointer type of the press SHALL decide, not the device: a mouse or a pen SHALL keep the 6 px handles at the ends. The bar SHALL be drawn the same for every pointer. A viewer of a shared project SHALL not be able to drag by touch either.

A drag by touch SHALL write what the same drag with a mouse writes, as "Reschedule from the timeline" states: the start or the deadline as one field operation, or every date the task has in one batch, applied locally first, queued while offline and converging per field by last-writer-wins.

#### Scenario: A finger drags the deadline
- **WHEN** a user on a touch screen presses a five-day bar 12 px inside its right end, holds past the hold interval and drags two days to the right
- **THEN** the task's deadline is two days later and its start and due date are unchanged

#### Scenario: A finger drags the start
- **WHEN** a user on a touch screen presses a five-day bar 12 px inside its left end, holds and drags one day to the left
- **THEN** the task's start is one day earlier and its due date and deadline are unchanged

#### Scenario: The middle of a short bar moves it
- **WHEN** a user on a touch screen presses the middle of a one-day bar, 32 px wide, holds and drags one day to the right
- **THEN** every date of the task is one day later, and a press in its last 10 px sets the deadline instead

#### Scenario: A mouse keeps the handles
- **WHEN** a user with a mouse presses a five-day bar 12 px inside its right end and drags two days to the right
- **THEN** every date of the task moves two days, and only a press on the 6 px handle at the end changes the deadline

#### Scenario: Deadline by touch offline
- **WHEN** the device is offline and a user drags the right end of a bar by touch to the 14th
- **THEN** the bar ends on the 14th at once, the deadline's operation is queued and uploaded on the next sync, and a deadline another device wrote meanwhile converges with it by the greater timestamp

### Requirement: The grid scrolls under a dragged bar
While a bar, one of its ends or an unscheduled row is being dragged and the pointer rests near the left or right edge of the timeline's grid, the grid SHALL scroll that way, faster the nearer the pointer is to the edge, until the pointer leaves the edge, the axis ends or the drag ends; the left edge SHALL be the edge of the scrolling days, after the names column where there is one. The day under the pointer SHALL stay marked as the drop target while the grid moves, and the drop SHALL land on the day under the pointer on release, counting the days that scrolled past. It SHALL apply to touch, mouse and pen. The grid SHALL end at the last day of the axis at every width: it SHALL NOT scroll into an empty strip after it. A swipe that is not a drag SHALL scroll the grid as before. Scrolling writes nothing; the drop writes as "Reschedule from the timeline" states, offline included, and converges per field.

#### Scenario: A bar reaches a day off screen
- **WHEN** a user holds a bar and rests it at the grid's right edge
- **THEN** the grid scrolls to later days under the bar, and releasing it moves the task's dates to the day then under the pointer

#### Scenario: Back toward earlier days
- **WHEN** a user drags a bar's left end to the grid's left edge and rests there
- **THEN** the grid scrolls to earlier days until the user moves away or the axis ends, and the start is set to the day under the pointer on release

#### Scenario: The end of the axis
- **WHEN** the timeline of a project with sections is scrolled as far as it goes on a phone, by a swipe or under a dragged bar
- **THEN** the last day of the axis is at the grid's right edge, with no empty strip after it

#### Scenario: Away from the edges
- **WHEN** a bar is dragged across the middle of the grid
- **THEN** the grid does not scroll

#### Scenario: A swipe still scrolls
- **WHEN** a user on a touch screen swipes sideways on the grid, on a bar or beside it, without holding first
- **THEN** the grid scrolls with the finger and no date changes
