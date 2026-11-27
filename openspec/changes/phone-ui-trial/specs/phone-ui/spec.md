# Spec Delta

## Purpose

Screens written only for a phone, shown in place of the responsive layout of the desktop screens below 768 px: where they are shown, what Today and the task page look like and do, and how one screen follows another.

## ADDED Requirements

### Requirement: The phone screens are shown below 768 px
Below 768 px Today and the task page SHALL be the phone screens of this capability; the other requirements of this capability say what every other screen is there. At every width from 768 px every screen SHALL be exactly as it is without this capability. The width of the window alone SHALL decide which screens are shown: no setting chooses them, and nothing about the choice is kept on the device, synced, sent to the server or written as an operation. It SHALL work offline, and a window that crosses 768 px SHALL change its screens without a reload.

#### Scenario: A phone
- **WHEN** a person opens Today on a 390 px phone
- **THEN** Today is the phone screen

#### Scenario: Not on a wide window
- **WHEN** the window is 768 px wide or wider
- **THEN** Today and the task page are the desktop screens

#### Scenario: Crossing the width
- **WHEN** a window is widened from 390 px to 900 px and narrowed again
- **THEN** Today is the desktop screen while wide and the phone screen while narrow, with the same tasks in both

### Requirement: Phone Today
The phone Today SHALL show the same tasks, in the same groups and the same order, as Today shows at 768 px for the same account, preferences and moment, including the Today limit. Above the list it SHALL show a large title with the date, which SHALL shrink into the bar when the list scrolls, and today's calendar events when the account has any. Its bar SHALL keep the menu button that opens the phone drawer. The tasks of a group SHALL be drawn as one card, and a group's own actions (for the overdue group: move all to today, reschedule) SHALL be in one menu at the end of the group's name. The screen SHALL have no add field of its own: a task is added with the add button. Tasks completed today SHALL be one row at the end that opens them. The phone Today SHALL NOT offer reordering by dragging in this capability; the order is the one Today computes. There SHALL be at most two rows of chrome above the first item. The tab bar and the add button SHALL stay as `app-shell` "Phone navigation" describes them. The screen reads local data only: it SHALL show the same content offline, and a change that arrives from another device SHALL appear without a reload.

#### Scenario: The same list
- **WHEN** an account has two overdue tasks, three tasks due today and one completed today, and Today is opened at 390 px
- **THEN** the screen shows those tasks under the same group names and in the same order as Today at 1280 px

#### Scenario: A group's actions
- **WHEN** two tasks are overdue and the person opens the menu at the end of the overdue group's name and chooses Move all to today
- **THEN** both tasks are due today, as the same action on the desktop Today does

#### Scenario: One way to add
- **WHEN** the phone Today is shown
- **THEN** it has no add field in the page, and the add button opens quick add with today's date

#### Scenario: The title shrinks
- **WHEN** the person scrolls a long Today down
- **THEN** the large title leaves the page and the bar shows "Today"

#### Scenario: The drawer still opens
- **WHEN** the person taps the menu button in the phone Today's bar
- **THEN** the phone drawer opens

#### Scenario: Offline
- **WHEN** the phone is offline and the person opens Today
- **THEN** the screen shows the tasks stored on the device

#### Scenario: A change from another device
- **WHEN** a task due today is created on another device and syncs while the phone Today is open
- **THEN** the task appears in its group without a reload

### Requirement: Phone task rows
A row of the phone Today SHALL show a check with a target of at least 44 px, the title on up to two lines at 16 px, and one line of facts under it holding at most four facts; with the check and the title that is at most six of the task's properties. A tap on the row SHALL open the task. A tap on the check, or a swipe to the right past the threshold, SHALL complete the task exactly as the desktop row does: a recurring task moves to its next date, the completion can be undone from the toast, and the phone gives its completion haptic. A swipe to the left SHALL open the phone date sheet for the task (see "Phone date sheet"). Each of these is a local operation: it SHALL work offline and converge on every device like the same action taken on a desktop.

#### Scenario: Complete with the check
- **WHEN** the person taps a row's check
- **THEN** the task is completed, the row leaves the list, and a toast offers Undo

#### Scenario: Undo
- **WHEN** the person taps Undo in that toast
- **THEN** the task is open again in its place

#### Scenario: A recurring task
- **WHEN** the person completes a task that repeats every day
- **THEN** the task is due tomorrow and is no longer in Today

#### Scenario: Swipe to schedule
- **WHEN** the person swipes a row to the left past the threshold
- **THEN** the phone date sheet opens for that task

#### Scenario: Completed offline
- **WHEN** the phone is offline and the person completes a task, then goes online
- **THEN** the task is completed on the person's other devices

### Requirement: Phone task page
The phone task page SHALL have its own bar with Back, the next and previous task and the task's menu, and SHALL hide the tab bar and the add button. Under the bar it SHALL show the check, the title and the note, then the facts the task has as rows in cards, each row at least 44 px tall and naming the fact and its value, and then the facts the task does not have as buttons, one each, so no fact is behind a "more" control. A tap on a fact row SHALL open a bottom sheet with that fact's editor; the sheet SHALL close by dragging it down, by Back and by its own control. Everything the task page shows or edits at 768 px SHALL be reachable on the phone task page: when, repeat and reminders, project and section, labels, priority, assignee, location, estimate, energy, relations, custom fields, notes, subtasks, attachments, comments, activity, time and history. Every edit is the same local operation as on the desktop page: it SHALL work offline and converge on every device.

#### Scenario: Edit the date
- **WHEN** the person taps the Do on row and picks Tomorrow
- **THEN** the row reads tomorrow, and the task is due tomorrow on every device after sync

#### Scenario: Add a fact the task does not have
- **WHEN** a task has no estimate and the person taps the Estimate button under the cards and sets 45 minutes
- **THEN** Estimate is a row in a card reading 45m and is no longer a button

#### Scenario: Dismiss a sheet
- **WHEN** a fact's sheet is open and the person drags it down, or presses Back
- **THEN** the sheet closes and the task page is still open

#### Scenario: Next task
- **WHEN** the person opened the first of three tasks from Today and taps the next task in the bar
- **THEN** the second task's page is shown

#### Scenario: Nothing is lost
- **WHEN** a task has a note, two subtasks, an attachment, a comment and a custom field value
- **THEN** the phone task page shows each of them and lets the person edit each of them

#### Scenario: Edited offline
- **WHEN** the phone is offline and the person changes a task's priority, then goes online
- **THEN** the task has the new priority on the person's other devices

### Requirement: Phone date sheet
Below 768 px, the date a task is to be done on SHALL be chosen in a bottom sheet made for a phone, opened by the task page's Do on row and by a swipe to the left on a row of the phone Today. The sheet SHALL show, from the top: the quick choices Today, Tomorrow, This weekend and Next week, each a target at least 44 px tall that names the date it means; a month with days as targets of at least 44 px, today and the chosen day marked, and the earlier and later months one tap away; a time row; the parts of the day when the account uses them; and Clear when the task has a date. Opened by the row swipe it SHALL also offer Someday, as the swipe offers today. A tap on a quick choice or on a day SHALL set the date and close the sheet; setting a time or a part of the day SHALL keep the sheet open until the person closes it. On a 360×640 screen the quick choices and the whole of a five-week month SHALL be visible without scrolling; the time row follows and may need a scroll inside the sheet. It writes the same fields, with the same Undo, as the Do on editor of the desktop task page, so a date set here SHALL be set offline and converge on every device. Start, deadline, repeat and reminders are separate rows of the phone task page and keep their present editors.

#### Scenario: Tomorrow in two taps
- **WHEN** the person taps the Do on row of a task with no date and taps Tomorrow
- **THEN** the sheet closes, the row reads tomorrow's date, and a toast offers Undo

#### Scenario: A day in the month
- **WHEN** the person opens the sheet, goes to the next month and taps the 14th
- **THEN** the task is to be done on the 14th of next month and the sheet closes

#### Scenario: A time
- **WHEN** the person opens the sheet for a task due today and sets 15:00
- **THEN** the task is due today at 15:00 and the sheet is still open

#### Scenario: Clear
- **WHEN** the person opens the sheet for a task with a date and taps Clear
- **THEN** the task has no date and the sheet closes

#### Scenario: From the row swipe
- **WHEN** the person swipes a row of the phone Today to the left past the threshold
- **THEN** the same sheet opens for that task, with Someday among its choices

#### Scenario: A small phone
- **WHEN** the sheet is open on a 360×640 screen
- **THEN** the quick choices and every week of a five-week month are visible without scrolling, and the time row is reached by scrolling the sheet

#### Scenario: Set offline
- **WHEN** the phone is offline and the person sets a task to Next week, then goes online
- **THEN** the task has that date on the person's other devices

### Requirement: Screens push and pop
Below 768 px, opening a task from the phone Today SHALL slide the task page in from the end edge, and going back SHALL slide it out, in the interface's standard duration. Back on the page, the system's Back and the edge swipe SHALL all return to Today at the scroll position the person left; the page's Back and the edge swipe slide the page out, and the system's Back, which the app learns of only once it has happened, returns without the slide. When the system requests reduced motion, or the browser cannot animate between screens, the screens SHALL change without animation and everything else SHALL work the same.

#### Scenario: Open and go back
- **WHEN** the person scrolls Today down, taps a task, and taps Back
- **THEN** the task page slides in, slides out again, and Today is at the same scroll position

#### Scenario: Reduced motion
- **WHEN** reduced motion is requested and the person taps a task
- **THEN** the task page appears without sliding

#### Scenario: System Back
- **WHEN** the task page is open in the Android app and the person presses the system Back
- **THEN** Today is shown at the scroll position the person left, without a slide, and the app stays open
