# Spec Delta

## ADDED Requirements

### Requirement: A task in a calendar list is the phone row
While the phone screens are on below 768 px, a task listed in Week's list of days, in Month's list of the chosen day and in Plan's agenda SHALL be drawn as the phone row, and the tasks of one day SHALL be one card. The row SHALL keep what the calendar says of the task there: its time or "all day" before the title, a span's place ("Day 2 of 3"), the deadline mark and the estimate. What a day lists and in which order SHALL be what `time-blocking`, `month-view`, `planner-view` and `multi-day-tasks` specify; events, slots, frames, deadlines and projected occurrences in those lists are unchanged.

A tap on the row SHALL open the task page, and the row's circle SHALL complete the task and offer Undo, as in a phone task list. A task the person may only read SHALL have no circle.

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
- **THEN** its row has no circle, and a tap still opens the task page

### Requirement: Swipes and the date sheet in a calendar list
While the phone screens are on below 768 px, a row in Week's list of days, Month's list of the chosen day and Plan's agenda SHALL take the swipes of a phone task list: to the end edge completes, to the start edge opens the date sheet. A hold on the row SHALL open the row's menu. Choosing a date in the sheet SHALL move the task to that day with the operation a task list writes, keep its time if it has one, and the lists SHALL show it under its new day. This is how a task moves to another day in Week on a phone, which has no grid to drag over. A task the person may only read SHALL take no swipe.

It SHALL work offline, and it SHALL converge with changes from other devices exactly as changing the date in a task list does.

#### Scenario: Move a task to Thursday
- **WHEN** a person swipes Tuesday's "Call the plumber" (09:30) to the start edge in Week and picks Thursday in the date sheet
- **THEN** the task is listed under Thursday at 09:30 and no longer under Tuesday

#### Scenario: Swipe to complete
- **WHEN** a person swipes a row of Plan's agenda to the end edge
- **THEN** the task is completed and Undo is offered

### Requirement: A block resizes under a finger
On a device whose main pointer is coarse, the top and the bottom of a task's block in the Day grid SHALL each take a resize from a zone at least 24 CSS px tall, reaching outside the block where the block is too short to hold both zones and the place it moves from. The block SHALL be drawn as it is with a fine pointer, and a hold in its middle SHALL still move it. With a fine pointer nothing changes. A resize SHALL write what it writes today, offline too, and converge as it does today.

#### Scenario: Lengthen a block by touch
- **WHEN** on a touch phone a person holds the bottom edge of a 30-minute block and moves down by two quarter-hours
- **THEN** the block is one hour long, with the same operation a mouse resize writes

#### Scenario: A short block
- **WHEN** a block is 15 minutes long on a touch phone
- **THEN** a hold on its middle moves it, and a hold just above or below it resizes it

#### Scenario: A mouse
- **WHEN** the main pointer is fine
- **THEN** the resize zones are as they were

### Requirement: Tap to place in Week on a phone
While the phone screens are on below 768 px and the planning list is shown in Week, a tap on one of its tasks followed by a tap on a day SHALL place the task on that day, without a time, with the operation a drop on that day writes. The bar that says which task is being placed, and its Cancel, SHALL be the ones Day shows. It SHALL work offline and converge as a drop does.

#### Scenario: Place on Friday
- **WHEN** a person taps "Buy primer" in the planning list in Week on a phone and then taps Friday
- **THEN** "Buy primer" is listed under Friday as all day

#### Scenario: Cancel
- **WHEN** a person taps a task of the planning list and then Cancel in the bar
- **THEN** nothing is placed
