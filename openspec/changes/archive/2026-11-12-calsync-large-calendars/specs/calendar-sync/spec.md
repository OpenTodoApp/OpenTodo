## MODIFIED Requirements

### Requirement: Calendar changes come back to the task
For the events it wrote, the server SHALL read changes from the target calendar every 5 minutes and about 20 seconds after the user's own task changes, using `sync-collection` with a sync token where the server supports it and an ETag listing otherwise. A new start, end or all-day state SHALL become the task's due (a timed event's length its estimate); a new title SHALL become the task's title; a deleted event SHALL leave the task without a due date and SHALL never delete or complete it. Every change SHALL be an op applied through the op log with device `calsync:<connection-id>`, so devices converge on it with their next sync like with any other device's edit. Events the server did not write SHALL never change and SHALL never become tasks. No answer the server reads SHALL exceed 4 MB: when the listing of changes would, the server SHALL read back only the events it wrote, by `calendar-multiget` in batches of at most 50, treat an event the calendar no longer has as deleted and a new ETag as a change, and continue from the calendar's current sync token; changed events SHALL be read back in batches of at most 50, a batch whose answer is over 4 MB halved until it fits. Only a single event over 4 MB SHALL stop the cycle with `too_large`.

#### Scenario: Event moved
- **WHEN** the user drags the event of a task from 09:00 to 14:00 the next day in their calendar app
- **THEN** after the next cycle the task is due the next day at 14:00, its history names calendar sync, and the user's devices show it after syncing

#### Scenario: Event made longer
- **WHEN** the user stretches a 30-minute event to 90 minutes
- **THEN** the task's estimate becomes 90 minutes

#### Scenario: Event deleted
- **WHEN** the user deletes the event of a task in the calendar
- **THEN** the task stays open without a due date and no event is written for it again

#### Scenario: A server without sync tokens
- **WHEN** the calendar server supports no `sync-collection`
- **THEN** changes are found from the ETag listing with the same results

#### Scenario: A calendar too large to list at once
- **WHEN** the target calendar holds so many events that listing them takes more than 4 MB, and the user moved one task's event and deleted another's
- **THEN** the cycle completes without `too_large`, the first task follows its event, the second stays open without a due date, and no answer read was over 4 MB

### Requirement: Connected calendars in Day and Week
The events of the calendars a user chose to show, and the target calendar's own events that OpenTodo did not write, SHALL be stored by the server and served and drawn read-only in Day, Week and the Plan like subscribed calendars' events, also while calendar feeds are off. They SHALL be refreshed by the sync cycle only when the calendar changed. They SHALL be read with a `calendar-query` over the store window; when its answer would be over 4 MB, the server SHALL read the two halves of the window instead, down to a day, and a day still over 4 MB by its ETags and `calendar-multiget` in batches, keeping an event that falls into several pieces once, so a calendar of any size is shown without any answer over 4 MB.

#### Scenario: A read calendar
- **WHEN** a user chooses their "Family" calendar to show
- **THEN** its events appear in Day and Week with the calendar's colour, and the device keeps them for offline display like other calendars' events

#### Scenario: A busy calendar
- **WHEN** the events of a shown calendar over the store window are more than 4 MB of iCalendar text
- **THEN** the cycle completes, every event in the window appears in Day and Week once, and no answer read was over 4 MB
