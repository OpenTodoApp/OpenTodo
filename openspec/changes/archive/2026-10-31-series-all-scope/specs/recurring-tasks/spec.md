## MODIFIED Requirements

### Requirement: Series edits and detached occurrences
Edits to a recurring task's title, description, project, priority, labels, due time or rule SHALL apply to the series, because the series is the task. The detail panel SHALL offer "This occurrence only", which SHALL write the current occurrence's record (open, no rule, `series_id` and `occurrence_date` set) and move the series to its next free occurrence. The record's id SHALL be derived from the series id and the occurrence date so concurrent detaching converges. When the series' title, priority, labels, project, section, estimate, due time and zone, assignee or location changes, the same batch SHALL write the new value to every open record of the series whose value of that field still equals the series' previous value; done and skipped records, notes and record dates SHALL NOT change, except as "Also past ones" (requirement "All occurrences including past ones") writes them when the user chose it. Copies made before records carried `occurrence_date` SHALL stay standalone tasks.

#### Scenario: Rename the series
- **WHEN** the user renames a recurring task
- **THEN** the next occurrence carries the new title after completion, with no prompt

#### Scenario: Detach and move one occurrence
- **WHEN** the user chooses "This occurrence only" on a task with `every monday` due 2026-10-12 and moves the copy to Tuesday
- **THEN** an open record of 2026-10-12 without a rule is due 2026-10-13, and the series is due 2026-10-19 with its rule intact

#### Scenario: Detached on two devices offline
- **WHEN** two devices detach the same occurrence offline and sync
- **THEN** exactly one record of that occurrence exists on every device

#### Scenario: Rename carries to a moved session
- **WHEN** Wednesday's "Study" occurrence was moved to 19:00, Thursday's was renamed "Study: mock exam", and the user renames the series "Spanish"
- **THEN** Wednesday's occurrence is titled "Spanish" at 19:00, Thursday's keeps "Study: mock exam", and the series is "Spanish"

#### Scenario: Only future ones by default
- **WHEN** the user renames a series that has done records without changing the second choice
- **THEN** the series and its open records are renamed and every done record keeps its title

## ADDED Requirements

### Requirement: All occurrences including past ones
While the panel shows a series on All occurrences to a user who may edit it, and the series has a past to affect (an earlier piece of its lineage, or a done or skipped occurrence record of the series or of an earlier piece), the panel SHALL show a second choice "Only future ones" or "Also past ones", reachable with the keyboard, announced with its selected option, at least 44 px tall on touch screens, with Only future ones selected each time the panel opens the series. Without a past to affect it SHALL NOT be shown. Only future ones SHALL keep the behaviour of "Series edits and detached occurrences". An edit made with Also past ones SHALL, in the same batch as the series' own change and with one Undo:
- write the new title, notes, labels, project (with its section) and priority to every done and skipped record of the series and to every record of its earlier pieces whose value of that field still equals that of the record's own series before the edit;
- write those fields to every earlier piece, a new due time and zone on each earlier piece's own due date, and a new calendar rule to each earlier piece with that piece's end kept;
- carry to the earlier pieces' open records what an All-occurrences edit carries to open records.

It SHALL never change a record's completion, skip, occurrence date or due date, never write a time or a rule to a record, and never change a later piece. The batch SHALL be planned from local rows and written locally first, so it works offline, and converge per field by last-writer-wins like any edit. On an encrypted account the device SHALL write the records' content fields encrypted for each record.

#### Scenario: Fix a typo in every session
- **WHEN** "Spansh class" `every tuesday` has done records on the 6th and 13th and a skipped record on the 20th, and the user chooses Also past ones and renames it "Spanish class"
- **THEN** the series and all three records are titled "Spanish class", the records keep their dates and their done and skipped states, and one Undo restores every title

#### Scenario: Across a split
- **WHEN** "Study" `every weekday` at 18:00 was split from the 14th to 19:00, the earlier series has a done record of the 12th, and the user opens the piece, chooses Also past ones and sets priority 1
- **THEN** the piece, the earlier series and the record of the 12th have priority 1, the earlier series keeps 18:00 and its `until`, and the record keeps its date and completion

#### Scenario: A new time stays off past dates
- **WHEN** the user chooses Also past ones on the piece of a split weekday series and changes its time to 07:00
- **THEN** the earlier series' due time becomes 07:00 on its own date, and no done or skipped record's due changes

#### Scenario: An occurrence changed on its own keeps its value
- **WHEN** the done record of the 13th was renamed "Study: mock exam" and the user renames the series "Spanish" with Also past ones
- **THEN** the other done records are titled "Spanish" and the record of the 13th keeps "Study: mock exam"

#### Scenario: No past, no question
- **WHEN** the user opens a series that was never split and has no done or skipped record
- **THEN** only the scope control is shown

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens a series with done records
- **THEN** the second choice is not shown
