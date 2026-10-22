## MODIFIED Requirements

### Requirement: Completion feedback
Completing a task SHALL write the completion as an ordinary operation at once (applied locally first, queued for sync, converging by last-writer-wins) and SHALL update every count live at that moment. The row SHALL then play a completion sequence within the moment duration: the check mark fills and pops, the title gains a strike-through and the row's text fades, the row collapses while the rows below move up, and the Undo toast enters; the list SHALL keep the row on screen as a *departing* row during the sequence, where it takes no input except Undo and is not counted or selectable. Completing several tasks in quick succession SHALL play each sequence independently without queueing and without delaying any write. Undo during the sequence SHALL cancel the departure and keep the row in place. Under reduced motion only the row's opacity fades; under no motion the row leaves at once. A board card SHALL play the same sequence in its column. Undo SHALL reopen the task as an ordinary operation, applied locally first, so it works offline and converges by last-writer-wins. The toast SHALL offer Undo for five seconds after a single completion.

#### Scenario: Undo a completion offline
- **WHEN** the device is offline, the user completes a task and activates Undo in the toast
- **THEN** the task is open again at once, the reopening is queued right after the completion as an ordinary op, and other devices converge on the open state

#### Scenario: The write does not wait for the animation
- **WHEN** the user completes a task and the device loses power 50 ms later
- **THEN** the completion is already in the local database and syncs on the next start

#### Scenario: Three in a row
- **WHEN** the user presses the complete key on three consecutive rows within half a second
- **THEN** each row starts its own sequence as its key is pressed, the cursor moves on at once each time, and all three completions are written in the order pressed

#### Scenario: Undo mid-sequence
- **WHEN** the user completes a task and activates Undo 200 ms later
- **THEN** the row stops departing, returns to its open state in place, and no second move plays

#### Scenario: Departing row is not a target
- **WHEN** a row is departing and the user presses the select key or drags over it
- **THEN** the selection and the drop position skip it as if it had already left

#### Scenario: A repeating task rolls forward
- **WHEN** the user completes a task that repeats every Monday
- **THEN** the check mark pops and returns to its open state, the date crossfades to the next Monday, the row tints briefly instead of leaving, and the toast names the next occurrence with Undo

#### Scenario: A habit keeps its streak
- **WHEN** the user completes a habit due today
- **THEN** the repeating sequence plays and the streak chip updates its number with a fade

#### Scenario: Card on a board
- **WHEN** the user completes a card on the board
- **THEN** the card plays the completion sequence, collapses, and the cards below it in the column move up

## ADDED Requirements

### Requirement: List reflow
When a local action changes which rows a visible list shows or where they sit (completion, reschedule, drag and drop, a bulk action, Undo, a drop on the sidebar), the list SHALL animate rows that stay to their new places and fade in rows that arrive, within the moment duration, using the browser's view transition and no library. The list SHALL animate at most a bounded number of rows (the rows on screen, never more than 40); a change that affects more rows, a change that arrives from sync or another device, a change while a text field in the list has focus, and every change under reduced motion SHALL apply instantly with no transition. In a browser without view transitions the list SHALL update instantly and work the same. A transition SHALL never delay the write it accompanies, and a new change during a running transition SHALL cut the running one short rather than wait.

#### Scenario: Reschedule in Today
- **WHEN** the user presses the schedule key on a task in Today and picks Tomorrow
- **THEN** the task's row fades out, the rows below slide up to close the gap, and the Today count changes at the same moment

#### Scenario: Drag to another section
- **WHEN** the user drops a row into another section of a project list
- **THEN** the row travels to its new place and the rows of both sections slide to make and close room

#### Scenario: Sync batch applies instantly
- **WHEN** another device reschedules five tasks and the batch arrives while Today is open
- **THEN** the list shows the new state without any row movement animation

#### Scenario: Too many rows
- **WHEN** a bulk action moves 60 tasks out of the open list
- **THEN** the list updates instantly with no transition

#### Scenario: Browser without the API
- **WHEN** the list is used in a browser that lacks view transitions and the user reschedules a task
- **THEN** the task moves at once and nothing else differs

#### Scenario: Typing is never interrupted
- **WHEN** the user is editing a title in place and a drag elsewhere in the list drops
- **THEN** the list updates instantly and the title field keeps focus and its caret
