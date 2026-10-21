## ADDED Requirements

### Requirement: Reminders written by calendar clients
A reminder MAY be created, changed or deleted by a CalDAV client through the alarm mapping of the `caldav-sync` capability. Such writes SHALL be ordinary reminder operations with the device id `caldav:<app-password-id>`, applied in the same batch as the task fields of the same PUT, and SHALL obey every rule of this capability afterwards: a relative reminder carries the firing time computed from the due date in that batch, a deadline reminder the one computed from the deadline, the device that later moves the due date or the deadline recomputes it, the server dismisses it when the task is completed, and the Trash rule applies. A calendar client SHALL never set or clear a reminder's delivered or dismissed times. Devices SHALL show such a reminder like any other, attributed to the calendar app in the task's history. Offline devices receive the reminder on their next sync and concurrent edits converge by per-field last-writer-wins, the deletion time being a tombstone.

#### Scenario: Reminder from a calendar app shown in the panel
- **WHEN** a calendar client adds an alarm "15 minutes before" to a task due tomorrow at 10:00
- **THEN** the task's detail panel on every device shows a reminder at 09:45 after sync, the history names the calendar app as its author, and push delivers it at 09:45

#### Scenario: Due date moved on a device afterwards
- **WHEN** a device later reschedules that task to Friday at 15:00
- **THEN** the reminder fires on Friday at 14:45 on every device and the calendar client's next fetch serves the same `-PT15M` trigger

#### Scenario: Completed task dismisses the calendar reminder
- **WHEN** the task is completed on a device before the reminder fires
- **THEN** the server records the reminder as dismissed like any other reminder, and nothing is written back to the calendar client

#### Scenario: Reminder limit respected
- **WHEN** a calendar client sends an alarm whose trigger is further from the due time than the reminder offset limit allows
- **THEN** no reminder is created and the alarm is kept as the client's own data
