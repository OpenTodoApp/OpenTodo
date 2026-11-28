# Spec Delta

## MODIFIED Requirements

### Requirement: Announcements and touch
The card SHALL be a labelled region that receives focus when the mode opens and after each advance. A polite live region SHALL announce the position and title of each task shown and the outcome of each decision in words. Every decision SHALL be a button usable by touch. From 768 px wide every decision SHALL be a visible button with its key, in a bar under the card that wraps without horizontal scrolling. Below 768 px the decisions SHALL be laid out as "Decision bar on a phone" says, without their keys.

#### Scenario: Screen reader hears the task
- **WHEN** the mode advances to the fourth task "Call the plumber"
- **THEN** the live region announces "4 of 17: Call the plumber"

#### Scenario: Outcome is announced
- **WHEN** the user schedules a task for 2026-10-16
- **THEN** the live region announces the scheduled date in the user's date format before the next task is announced

#### Scenario: Phone width
- **WHEN** the mode is shown at 360 px wide
- **THEN** every decision is in the bar at the bottom of the screen or in its More menu, and nothing scrolls sideways

#### Scenario: A wide window keeps its bar
- **WHEN** the mode is shown at 768 px wide or more
- **THEN** every decision is a visible button with its key under the card, and there is no More menu

## ADDED Requirements

### Requirement: Decision bar on a phone
Below 768 px the mode SHALL show its decisions in a bar pinned to the bottom of the screen, directly above the tab bar, in the same place for every task whatever the length of its title and notes. The bar SHALL hold two rows:
1. Today, Schedule, Move, Complete and More, each a target at least 48 px high with an icon and its word;
2. Back and Skip, each at least 48 px high. Back SHALL be disabled on the first task.

More SHALL open a menu named "More" holding Delegate, Labels, Someday (while the mode offers it), Open and Trash. With nobody to delegate to, Delegate SHALL be disabled in that menu with the sentence that delegating needs a shared project. No decision SHALL show a key. The bar SHALL never cover the card: the card and its notes scroll above it. The floating add button SHALL NOT be shown on this screen below 768 px (`app-shell` "No floating add button in the rituals"); the tab bar SHALL stay, and a toast SHALL show above the bar.

Inside the Open Loops home's Clarify move the same two rows SHALL follow the card in the page instead of being pinned, and the home keeps its add button.

Every control of the bar and of the menu SHALL do exactly what the decision of the same name does elsewhere in the mode: the same operations, written locally first. It SHALL work offline, and it SHALL converge with changes from other devices exactly as that decision does.

#### Scenario: The bar at 390 px
- **WHEN** the mode shows a task at 390 px wide
- **THEN** the bar shows Today, Schedule, Move, Complete and More, then Back and Skip, and no key

#### Scenario: Today from the bar
- **WHEN** the user taps Today
- **THEN** the task is due today, by the operation `t` writes, and the next task is shown

#### Scenario: Trash from More
- **WHEN** the user taps More, then Trash
- **THEN** the task is in the Trash, Undo is offered and the next task is shown

#### Scenario: Nobody to delegate to
- **WHEN** the user shares no project with another member and opens More
- **THEN** Delegate is disabled and says that delegating needs a project shared with someone

#### Scenario: Skip and Back
- **WHEN** the user taps Skip on the first of three tasks, then Back
- **THEN** the second task is shown at "2 of 3", then the first again at "1 of 3", and nothing is written

#### Scenario: A long task
- **WHEN** a task's notes are longer than the screen
- **THEN** the notes scroll above the bar, and the bar stays where it was

#### Scenario: No add button
- **WHEN** the user opens the mode on a 390 px phone
- **THEN** the tab bar stays, there is no floating add button, and it is back when the user returns to the Inbox

#### Scenario: Offline
- **WHEN** the device is offline and the user decides three tasks from the bar
- **THEN** each decision shows at once, and the three are sent when the device is online again

### Requirement: Swipes on the card
Below 768 px on a touch screen the card SHALL take the two swipes of a task row (`task-list-presentation`, with the same distances and the same named edge): a swipe towards the end of the line SHALL complete the task and advance, exactly as Complete does, and a swipe towards its start SHALL open the scheduling sheet, exactly as Schedule does. A swipe released short SHALL return the card and change nothing. A mouse SHALL never swipe, and a press in the title while it is being edited SHALL belong to the text. Skip, Back and every other decision SHALL have no swipe.

A completion by swipe SHALL be the operation Complete writes, with its Undo; opening the sheet writes nothing until a day is chosen. Both SHALL work offline and converge as those decisions do.

#### Scenario: Swipe to complete
- **WHEN** the user swipes the card of "Call the plumber" past the commit distance towards the end of the line
- **THEN** the task is completed, Undo is offered, and the next task is shown

#### Scenario: Swipe to schedule
- **WHEN** the user swipes the card towards the start of the line
- **THEN** the scheduling sheet opens for that task, and nothing is written until a day is chosen

#### Scenario: A short swipe
- **WHEN** the user moves the card 40 px and lets go
- **THEN** the card returns, the same task is shown and nothing is written

#### Scenario: A mouse
- **WHEN** the mode is shown in a 390 px window and the user drags over the card with a mouse
- **THEN** the card does not move and nothing is written

#### Scenario: Offline
- **WHEN** the device is offline and the user completes a task with a swipe
- **THEN** the task is completed on the device at once, and the change is sent when the device is online again

### Requirement: Pickers are sheets on a phone
Below 768 px the pickers of Move, Delegate and Labels SHALL open as bottom sheets sized to their content, with the page visible above them, like the scheduling sheet. The Move sheet SHALL list the projects at once, each chosen with one tap, with a field above the list that filters them. No sheet SHALL open the on-screen keyboard until its field is tapped. Choosing SHALL write what the picker writes from 768 px (a move, a delegation as one operation set, a label change that does not advance); closing a sheet without choosing SHALL write nothing and keep the same task. Each SHALL work offline and converge as the same choice does from 768 px.

#### Scenario: Move with one tap
- **WHEN** the user taps Move at 390 px and taps "Home" in the sheet
- **THEN** the task is in Home by the same move as from 768 px, and the next task is shown

#### Scenario: Close a sheet
- **WHEN** the user taps Move and closes the sheet
- **THEN** nothing is written and the same task is shown

#### Scenario: Labels stay on the task
- **WHEN** the user opens More, taps Labels, taps `errand` and closes the sheet
- **THEN** the task has the label `errand` and is still the task shown

#### Scenario: Offline
- **WHEN** the device is offline and the user moves a task from the sheet
- **THEN** the task leaves the Inbox at once, and the move is sent when the device is online again
