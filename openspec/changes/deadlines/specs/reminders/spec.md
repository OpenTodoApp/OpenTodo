# Spec Delta

## MODIFIED Requirements

### Requirement: Reminder entity
A reminder SHALL belong to exactly one task and SHALL carry a kind (relative, absolute or deadline), an offset in minutes for relative and deadline reminders, a firing time as a Unix millisecond instant, optional delivered and dismissed times, a creation time and an optional deletion time. A task MAY have several reminders. Every reminder write SHALL be a field-level operation applied locally first, so reminders can be managed offline and converge by the same per-field last-writer-wins rule as tasks.

#### Scenario: Add a reminder offline
- **WHEN** the device is offline and the user adds a reminder to a task
- **THEN** the reminder appears in the task's detail panel at once, survives a reload, and is uploaded on the next successful sync

#### Scenario: Concurrent edits converge
- **WHEN** device A changes a reminder's offset while device B deletes the same reminder, both offline, and both sync
- **THEN** every device shows the reminder deleted, because the deletion time is a tombstone field

#### Scenario: Invalid reminder values
- **WHEN** a client submits a reminder with an unknown kind, a non-integer offset, a firing time that is not a positive number, or a task id that is not a string
- **THEN** the write is rejected as an invalid operation and nothing changes

## ADDED Requirements

### Requirement: Deadline reminders
A reminder of kind `deadline` SHALL fire at 09:00, in the local time zone of the device that computes it, on the task's deadline plus its offset in minutes (negative means before). It SHALL have no firing time while the task has no deadline and SHALL NOT move when the due date changes. The device that changes the deadline SHALL recompute the firing time of every live deadline reminder of that task in the same batch, so both converge from one edit.

#### Scenario: Add a deadline reminder
- **WHEN** a task has the deadline 2026-11-06 and the user adds a reminder "1 day before the deadline"
- **THEN** a reminder of kind `deadline` with offset −1440 minutes is created and fires on 2026-11-05 at 09:00 local time

#### Scenario: Deadline moved offline
- **WHEN** the device is offline and the user moves that task's deadline to 2026-11-13
- **THEN** the reminder's firing time becomes 2026-11-12 at 09:00 at once, and the deadline and the firing time reach other devices in one batch

#### Scenario: Due date change leaves it alone
- **WHEN** the due date of a task with a deadline reminder is rescheduled
- **THEN** the deadline reminder's firing time is unchanged and only the task's relative reminders move

#### Scenario: Deadline cleared
- **WHEN** the deadline of a task with a deadline reminder is cleared
- **THEN** the reminder is kept, has no firing time and does not fire until the task gets a deadline again

#### Scenario: Older client leaves it alone
- **WHEN** a device running a client that predates this kind receives a deadline reminder and reschedules the task's due date
- **THEN** it stores and forwards the reminder untouched and recomputes only the relative reminders it knows, so the deadline reminder keeps its firing time
