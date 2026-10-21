## ADDED Requirements

### Requirement: Reopen the day
Until the user's logical day ends, a day closed on that logical day SHALL be reopenable from the "Day closed" row at the end of Today and from the Close the day screen with "Reopen the day". Applying the carry-over SHALL record on the user's `review` entity, in the additive field `carry_over`, the logical date and, for each task the batch changed, the task, the field and its value before and after the batch. Reopening SHALL write, as ONE batch of ordinary operations undone in one step from its toast or `Ctrl`/`⌘`+`Z`: each recorded field back to its value before, unless the field no longer holds the value the batch wrote, in which case it is left alone and the task is named in the toast; `closed_at` cleared (0, as for a day never closed) and `carry_over` emptied; `tomorrow_note` kept, so a later close starts from it. After the logical day ends, or when nothing was closed on it, Reopen SHALL not be offered. Reopening SHALL work offline through the outbox, and every field SHALL converge by last-writer-wins like any other edit. `carry_over` holds task ids, field names and dates, never user-written text, so it is not encrypted for an encrypted account; it is in the JSON export and derives no activity event.

#### Scenario: Reopen after the toast is gone
- **WHEN** the user closed the day at 18:30, moving four tasks to tomorrow, and at 20:00 activates "Reopen the day" on the row at the end of Today
- **THEN** the four tasks are due today again, the row reads "Close the day", the toast reads "Day reopened, 4 tasks back in Today" with Undo, and the line for tomorrow is still filled in when Close the day is opened again

#### Scenario: A task changed since the close
- **WHEN** the carry-over moved five tasks to tomorrow, the user then gave one of them Friday by hand, and reopens the day
- **THEN** four tasks return to today, the one due Friday stays on Friday, and the toast names it

#### Scenario: Reopen on another device
- **WHEN** the laptop closed the day and the phone, after syncing, reopens it while offline
- **THEN** the phone shows the tasks back in Today at once, and after both sync every device shows the day open and the tasks due today

#### Scenario: Next morning
- **WHEN** the day was closed yesterday and the user opens Today after the day start
- **THEN** no Reopen is offered for yesterday, and the row offers "Close the day" for the new day

#### Scenario: Older server
- **WHEN** the device syncs with a server that does not know `carry_over`
- **THEN** that op is rejected as unknown, the device keeps its local value, the carry-over and reopen task ops still sync, and Reopen on another device restores only the close stamp and says that the tasks stay where they are
