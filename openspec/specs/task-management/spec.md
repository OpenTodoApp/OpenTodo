# task-management Specification

## Purpose
Defines the task entity and its lifecycle: capture, editing of its fields, prioritisation, scheduling with floating dates, completion and deletion.

## Requirements

### Requirement: Task fields
A task SHALL have a title, a description, an optional project, a priority from 1 (highest) to 4 (lowest, default), an optional due date, labels, an optional assignee, a sort position, creation time, optional completion time, optional deletion time and an optional opaque `ical_extra` text holding calendar properties the app does not model. Fields reserved for later changes (`parent_id`, `labels`) and `ical_extra` SHALL be stored and synced even before the client offers an interface for them. Every field SHALL be editable offline and SHALL converge by per-field last-writer-wins.

#### Scenario: Default values on creation
- **WHEN** a task is created with only a title
- **THEN** it has priority 4, no project (Inbox), no due date, no assignee, empty description and labels, no `ical_extra`, and is neither completed nor deleted

#### Scenario: Invalid field values
- **WHEN** a client submits a priority outside 1 to 4, a non-string title, or a due date that is not `YYYY-MM-DD` with an optional `HH:MM` time
- **THEN** the write is rejected as invalid and no field changes

#### Scenario: Opaque field survives offline edits
- **WHEN** a task carries `ical_extra` and a device edits the task's title while offline, then syncs
- **THEN** the task keeps its `ical_extra` value and the new title on every device

### Requirement: Quick capture
The client SHALL offer a single-line quick-add input in every task view that creates a task on Enter and stays focused for the next entry. The line SHALL be parsed for attributes as defined by the natural-language-capture capability. The new task SHALL inherit the view's context (project, Today's date, Upcoming's tomorrow) for every attribute the line does not set.

#### Scenario: Capture in a project
- **WHEN** the user types a title in a project view and presses Enter
- **THEN** a task with that title appears in that project immediately, with no network round trip

#### Scenario: Capture in Today
- **WHEN** the user adds a task from the Today view
- **THEN** the task is due today

#### Scenario: Explicit token overrides the view
- **WHEN** the user is in the Today view and enters `Plan trip next Monday #travel`
- **THEN** the task is due next Monday and filed in "Travel", not today in the Inbox

#### Scenario: Input stays ready
- **WHEN** a parsed task is created
- **THEN** the input is cleared, all chips are gone and focus remains in the input

### Requirement: Edit task fields
The user SHALL be able to change a task's title, description, project, priority, due date and due time from a detail panel. Each change SHALL be applied locally at once and recorded as an operation for sync.

#### Scenario: Change priority with the keyboard
- **WHEN** a task is selected in a list and the user presses `1`, `2`, `3` or `4`
- **THEN** the task's priority becomes that value

#### Scenario: Clear a due date
- **WHEN** the user clears the due date of a scheduled task
- **THEN** the task has no due date and leaves the Today and Upcoming views

### Requirement: Floating due dates
Due dates SHALL be floating by default: a calendar date with an optional wall-clock time and no time zone, meaning the same calendar day and clock time wherever the task is viewed. A due with a time MAY instead be zoned by naming a time zone, in which case it denotes one instant (see "Zoned due times"). "Today" SHALL be evaluated in the viewer's local time zone for both kinds.

#### Scenario: Same date on every device
- **WHEN** a task is due on `2026-10-11` and is viewed from devices in different time zones
- **THEN** every device shows it due on the 11th of October

#### Scenario: Floating time stays put
- **WHEN** a floating task due at `09:00` is viewed from devices in different time zones
- **THEN** every device shows `09:00`

#### Scenario: Default is floating
- **WHEN** a task is created with a due date and time from quick add or the detail panel without touching the zone option
- **THEN** the due is floating and carries no time zone

### Requirement: Complete and reopen
A task SHALL be completable and reopenable from the list, the detail panel and the keyboard. Completing a task without a recurrence rule SHALL record the completion time and remove the task from open views without deleting it. Completing a task with a recurrence rule SHALL record a completed occurrence and move the task to its next occurrence, unless the rule's end condition is reached, in which case it completes like any other task. All of this SHALL work offline and converge across devices.

#### Scenario: Complete from the list
- **WHEN** the user clicks the circle of an open task or presses `c` with it selected
- **THEN** the task gains a completion time, disappears from the current open view and appears in Completed

#### Scenario: Reopen
- **WHEN** the user reopens a completed task
- **THEN** the completion time is cleared and the task returns to its project or Inbox

#### Scenario: Complete a recurring task
- **WHEN** the user completes a task with `every day` due today
- **THEN** a completed entry for today appears in Completed and the task stays open, due tomorrow, keeping its rule

#### Scenario: Reopen a completed occurrence
- **WHEN** the user reopens a completed occurrence of a series
- **THEN** that occurrence becomes a standalone open task with its original due date, and the series is not moved back

#### Scenario: Complete the same occurrence on two devices offline
- **WHEN** two devices complete the same occurrence without a network and later sync
- **THEN** Completed shows that occurrence once and the series is due on the same next occurrence on both devices

### Requirement: Soft delete
Deleting a task SHALL set a deletion time rather than removing data. Deleted tasks SHALL be hidden from all views except the Trash and from list endpoints, SHALL remain in the export, SHALL stay deleted on every device after sync, and SHALL be restorable from the Trash until purged.

#### Scenario: Delete syncs as a tombstone
- **WHEN** a task is deleted on one device while another device edits its title offline
- **THEN** after both devices sync, the task is deleted on both and the title edit does not resurrect it

#### Scenario: Deleted task is only visible in the Trash
- **WHEN** a task is deleted
- **THEN** it is absent from Inbox, Today, Upcoming, Completed, project and filter views and present in the Trash

### Requirement: Duration estimate
A task SHALL have an optional duration estimate `estimate_minutes`, a positive integer number of minutes or null (default). It SHALL be stored, validated, exported and synced as a field under the same last-writer-wins rule as every other task field, SHALL be settable offline, and SHALL be shown on the task row when present.

#### Scenario: Estimate from quick add
- **WHEN** a task is created from the line `Write report +45m`
- **THEN** the task has `estimate_minutes` 45 and the row shows `45m`

#### Scenario: Invalid estimate rejected
- **WHEN** a client submits `estimate_minutes` of 0, a negative number, a non-integer or a string
- **THEN** the write is rejected as invalid and no field changes

#### Scenario: Older client ignores the field
- **WHEN** a device running a client without estimate support receives an operation for `estimate_minutes`
- **THEN** the operation is stored and forwarded unchanged and the device otherwise behaves normally

### Requirement: Zoned due times
A due value MAY carry a `tz` naming an IANA time zone together with a time. Such a due SHALL denote the instant at that wall-clock time in that zone on that date. It SHALL be stored and synced inside the existing `due` field as one value, editable offline, converging by last-writer-wins with any other due edit, so date, time and zone never come from different edits.

#### Scenario: Set a zoned time offline
- **WHEN** the device is offline and the user fixes a task to `09:00 Europe/Berlin`
- **THEN** the task shows the zoned time immediately and the value is uploaded on the next successful sync

#### Scenario: Concurrent floating and zoned edits
- **WHEN** device A sets a floating `10:00` and device B sets `10:00 America/New_York` on the same task offline, and both sync
- **THEN** every device shows the whole due value from the edit with the greater timestamp, never a floating date with the other device's zone

#### Scenario: Zone without time
- **WHEN** a client submits a due with `tz` but no `time`, or with a zone name the server does not know
- **THEN** the write is rejected as invalid and the due is unchanged

### Requirement: Display in the viewer's zone
A zoned due SHALL be shown converted to the viewer's local time zone in every list, heading, sort order and date grouping. When the task's zone differs from the viewer's, the original wall time and zone SHALL be shown as a hint. Conversion SHALL happen on the device from local data and SHALL not require the network.

#### Scenario: Viewed from another zone
- **WHEN** a task due `09:00 Europe/Berlin` on the 11th is viewed from Los Angeles
- **THEN** it is listed on the 11th at `00:00` with the hint `09:00 Berlin`, and sorts before a floating task due at `08:00` that day

#### Scenario: Crosses midnight
- **WHEN** a task due `02:00 Asia/Tokyo` on the 12th is viewed from Berlin
- **THEN** it appears under the 11th at `19:00` in Today or Upcoming, and the hint shows the 12th in Tokyo

#### Scenario: Same zone as the viewer
- **WHEN** the task's zone equals the viewer's zone
- **THEN** no hint is shown and the row looks like a floating timed task

### Requirement: Daylight-saving transitions
A zoned due SHALL be interpreted with the zone's rules in force on its date, so the instant follows daylight-saving changes and future rule updates. A wall time that does not exist on that date SHALL resolve to the first valid instant after the gap; a wall time that occurs twice SHALL resolve to its first occurrence.

#### Scenario: Spring-forward gap
- **WHEN** a task is due `02:30 Europe/Berlin` on a day when clocks jump from 02:00 to 03:00
- **THEN** it is treated as `03:00` that day and a viewer in London sees `02:00`

#### Scenario: Across a transition between zones
- **WHEN** a task due `09:00 Europe/Berlin` is viewed from New York one week before and one week after Europe's clock change, while America's has not changed yet
- **THEN** the displayed local time differs by one hour between the two weeks

### Requirement: Convert between floating and zoned
The detail panel SHALL offer a keyboard-reachable toggle to fix a timed due to a zone or release it. Fixing SHALL keep the displayed date and time and set the viewer's zone. Releasing SHALL keep the date and time as currently displayed in the viewer's zone and drop the zone. A due without a time SHALL not be fixable and SHALL stay floating. The conversion SHALL be one ordinary due edit, applied locally first.

#### Scenario: Fix to my zone
- **WHEN** a Berlin user fixes a floating task due `09:00`
- **THEN** the due becomes `09:00 Europe/Berlin` and the row still reads `09:00`

#### Scenario: Release in another zone
- **WHEN** a Los Angeles user releases a task due `09:00 Europe/Berlin` that they see at `00:00`
- **THEN** the due becomes floating `00:00` on the displayed date and the hint disappears

#### Scenario: Clear the time of a zoned due
- **WHEN** the user clears the time of a zoned task
- **THEN** the zone is dropped as well and the task becomes a floating date

### Requirement: Zoned due sync and API format
The sync and REST representation of a zoned due SHALL be the existing `due` object with the additional `tz` key, nothing else changed; servers and clients that do not know `tz` SHALL store and forward the value untouched. Export SHALL include `tz`. The REST collection SHALL accept and return the same shape and SHALL reject invalid combinations with `invalid_input`.

#### Scenario: Pass-through on an older device
- **WHEN** a client that predates this change receives a zoned due and later edits the task's title
- **THEN** the due value, including `tz`, is unchanged after sync

#### Scenario: Create via the API
- **WHEN** a script POSTs a task with `{"due":{"date":"2026-10-11","time":"09:00","tz":"Europe/Berlin"}}` with a bearer token
- **THEN** the response is 201 with the same due value, and devices show it converted to their zone after sync

#### Scenario: Invalid via the API
- **WHEN** a script PATCHes a task with `{"due":{"date":"2026-10-11","tz":"Europe/Berlin"}}`
- **THEN** the response is 400 with code `invalid_input` and the task is unchanged
