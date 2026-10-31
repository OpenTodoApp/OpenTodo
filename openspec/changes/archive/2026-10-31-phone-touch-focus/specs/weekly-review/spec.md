## ADDED Requirements

### Requirement: Filling the focus by touch
Today's focus SHALL be fillable and emptiable without a keyboard. In Bento style an empty slot in the Daily check SHALL be a target of at least 44 × 44 px on a coarse pointer that opens a task picker for that slot, listing open tasks not already in the focus: today's and overdue tasks first, and within each group the tasks whose estimate suggests that slot first, then tasks without an estimate, then the rest; choosing one SHALL put it in that slot. In Three tasks style the Daily check SHALL show Today's focus with an Add to focus row while it holds fewer than three tasks, and the Loop home SHALL offer Add to focus while there is room; both open the picker. One task's Actions menu, the task panel's and task page's menu and the Focus screen's menu SHALL offer Add to focus (Three tasks) or Put in a slot (Bento) for an open task not in today's focus, and Remove from focus for a task in it, also for a task of a shared project the user only views. These paths SHALL follow the same rules as `f`, and every change SHALL be one batch on the user's `review` row with Undo, written offline and converging like the focus written with `f`.

#### Scenario: Empty slot by touch
- **WHEN** Bento is on, Large is empty and the user taps the empty Large row at 390 px
- **THEN** a picker lists today's tasks with a 90-minute or longer estimate first, and choosing "Write the report" puts it in Large with Undo

#### Scenario: Three tasks by touch
- **WHEN** Three tasks is on and today's focus holds one task
- **THEN** the Daily check shows Add to focus, and choosing a task in its picker adds it as the second focus task

#### Scenario: Menu adds and removes
- **WHEN** the user opens a task's Actions menu and chooses Add to focus, then opens it again
- **THEN** the task is in today's focus, the toast offers Undo, and the menu now offers Remove from focus

#### Scenario: Menu in Bento without an estimate
- **WHEN** Bento is on and the user chooses Put in a slot for a task without an estimate
- **THEN** the slot menu opens with the free slots, as for `f`

#### Scenario: Full
- **WHEN** the focus already holds three tasks and the user chooses Add to focus on a fourth
- **THEN** nothing is written and a message says to take one out first

#### Scenario: Viewer
- **WHEN** the task belongs to a shared project the user only views
- **THEN** the menu still offers Add to focus or Put in a slot, and the task joins the user's own focus
