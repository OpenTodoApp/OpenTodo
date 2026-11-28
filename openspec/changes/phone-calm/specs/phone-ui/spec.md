## ADDED Requirements

### Requirement: What a task could have, as chips
On a phone the facts a task does not have yet SHALL show under its cards as one wrapping row of small chips, each the fact's icon and name, rather than as a grid of tiles; a tap SHALL open the fact's sheet as a tile did. While the person may change the task, the row SHALL end with an Attach chip that opens the attach choices (files, a link), in place of the paperclip under the note. A fact that gets a value SHALL leave the chips and join the cards.

#### Scenario: A task with only a date
- **WHEN** the person opens a task that has only a date on a 390 px phone
- **THEN** under the date's card one row of chips offers the other facts and Attach, two or three chips to a line, and no paperclip shows under the note

#### Scenario: Add a deadline
- **WHEN** the person taps the Deadline chip and picks Friday
- **THEN** Deadline leaves the chips and shows as a row in the cards with Friday

### Requirement: The task page's bar
On a phone the task page's bar SHALL hold Back, named by the list the task was opened from, and the task's menu, and no other control. When the task was opened from a list, the menu SHALL start with Next task and Previous task, each carrying the task's place in the list ("4 of 10") and disabled at the list's end; `j` and `k` SHALL step as before.

#### Scenario: Step from the menu
- **WHEN** the person opens the fourth of ten tasks of Today on a phone, opens the menu and chooses Next task
- **THEN** the fifth task's page shows in place, and its menu says "5 of 10"

### Requirement: A calm Today on a phone
On a phone Today's header SHALL show the menu button and one menu, with the list's display options as an item of that menu that opens them as a sheet; every list with display options SHALL do the same. Today's briefing SHALL leave out the late tasks while the Late card says them, and SHALL show nothing when that was all it had to say. The Earlier group's header SHALL offer one Reschedule control whose choices are Today, Tomorrow, Next week and Pick a date, the same writes with Undo as before. Where Today shows its Done today group, the Done today card SHALL, once a task was completed today, open that group and bring it into view. A task due yesterday SHALL say Yesterday in its row, with its time when it has one.

#### Scenario: Today with only late tasks to mention
- **WHEN** three tasks are late and nothing else stands out, and Today opens on a phone
- **THEN** the Late card shows 3, no briefing line shows, and the header shows the menu button and one menu

#### Scenario: Reschedule the late tasks
- **WHEN** the person taps Reschedule in the Earlier group's header and chooses Today
- **THEN** every task of the group moves to today and a toast offers Undo

#### Scenario: Yesterday's task
- **WHEN** a task was due yesterday at 09:30 and Today opens on a phone
- **THEN** its row says "Yesterday 09:30" in the danger tone
