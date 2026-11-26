# Spec Delta

## ADDED Requirements

### Requirement: A task in a calendar list is the phone row
While the phone screens are on below 768 px, a task listed in Week's list of days, in Month's list of the chosen day and in Plan's agenda SHALL be drawn as the phone row, and the tasks of one day SHALL be one card. The row SHALL keep what the calendar says of the task there: its time or "all day" before the title, a span's place ("Day 2 of 3"), the deadline mark and the estimate. What a day lists and in which order SHALL be what `time-blocking`, `month-view`, `planner-view` and `multi-day-tasks` specify; events, slots, frames, deadlines and projected occurrences in those lists are unchanged.

A tap on the row SHALL open the task page, and the row's circle SHALL complete the task and offer Undo, as in a phone task list. The circle of a task the person may only read SHALL be off.

Every change made from the row SHALL be written as the same operations as the same action in a phone task list. It SHALL work offline, and it SHALL converge with changes from other devices exactly as that action does.

#### Scenario: Open a task from Week
- **WHEN** the phone screens are on at 390 px, Week lists "Call the plumber" at 09:30 on Tuesday, and a person taps it
- **THEN** the task page opens, and Back returns to Week at the same week

#### Scenario: Complete from Month's day list
- **WHEN** a person taps the circle of a task in the list under Month's grid
- **THEN** the task is completed with the same operation as in a task list, Undo is offered, and the day's count in the grid follows

#### Scenario: A row keeps its calendar facts
- **WHEN** a three-day task is listed on its second day in Plan's agenda
- **THEN** its row says "all day" and "Day 2 of 3", and has its estimate

#### Scenario: Offline
- **WHEN** the device is offline and a person completes a task from Week
- **THEN** the task is completed on the device at once, and the change is sent when the device is online again

#### Scenario: A read-only task
- **WHEN** Week lists a task of a project the person may only read
- **THEN** its circle is off, and a tap still opens the task page

### Requirement: Swipes and the date sheet in a calendar list
While the phone screens are on below 768 px, a row in Week's list of days, Month's list of the chosen day and Plan's agenda SHALL take the swipes of a phone task list: to the end edge completes, to the start edge opens the date sheet. Choosing a date in the sheet SHALL move the task to that day with the operation a task list writes, keep its time if it has one, and the lists SHALL show it under its new day. This is how a task moves to another day in Week on a phone, which has no grid to drag over. A task the person may only read SHALL take no swipe.

It SHALL work offline, and it SHALL converge with changes from other devices exactly as changing the date in a task list does.

#### Scenario: Move a task to Thursday
- **WHEN** a person swipes Tuesday's "Call the plumber" (09:30) to the start edge in Week and picks Thursday in the date sheet
- **THEN** the task is listed under Thursday at 09:30 and no longer under Tuesday

#### Scenario: Swipe to complete
- **WHEN** a person swipes a row of Plan's agenda to the end edge
- **THEN** the task is completed and Undo is offered

### Requirement: A block resizes under a finger
When a block of the Day or Week grid (a task's, a slot's, or an event that can be changed) is pressed by touch, a press within 24 CSS px of its top or of its bottom SHALL start a resize of that end, and never within more than a third of the block's height from either end, so that the middle third at least always moves the block. With a mouse or a pen the zones are the few pixels they were. The block SHALL be drawn the same for every pointer. A block too short to offer a useful zone keeps its other way to change its length: the estimate on the task's page. A resize SHALL write what it writes today, offline too, and converge as it does today.

#### Scenario: Lengthen a block by touch
- **WHEN** on a touch phone a person holds a two-hour block 20 px above its bottom edge and moves down by two quarter-hours
- **THEN** the block is two and a half hours long, with the same operation a mouse resize writes

#### Scenario: The middle moves
- **WHEN** a person holds the middle of a one-hour block by touch and moves it
- **THEN** the block moves and keeps its length

#### Scenario: A mouse
- **WHEN** a block is pressed with a mouse 20 px above its bottom edge
- **THEN** the block moves, as before
