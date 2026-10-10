# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
