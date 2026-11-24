# Spec Delta

## MODIFIED Requirements

### Requirement: Exceptions come from the records
The exception dates of a series SHALL be the occurrence dates of its records, whatever their state. No projection SHALL be drawn on an exception date, and moving the series to its next occurrence (by completion, skip or "This occurrence only") SHALL go to the first occurrence date after the current one that is not an exception. No list of exceptions SHALL be stored on the series. A device that may edit a series and finds it due on one of its exception dates SHALL write the series' due date, and the deadline and start that move with it, to the next date that is not an exception; the server SHALL apply the same rule before it completes a series. Because the value is a function of synced rows, devices that repair concurrently SHALL converge. A date change in the app that would put a series with a calendar rule on one of its exception dates (When, a drag in Day, Week, Month, Plan or Upcoming, a drop on Today, Triage, the re-plan and the bulk and group Due actions) SHALL leave that series as it is: changing one task, it SHALL write nothing and SHALL say in a toast, instead of "Date changed", that the date is already done, was skipped or was moved; changing several, it SHALL change the others and the toast SHALL add how many were not moved. A date change in When that moves a series SHALL move its start and deadline by the same number of days as the due date. The check SHALL read the rows on the device, offline included, so there is nothing to converge. A write the server applies on its own behalf (the REST API and the `ot` CLI through it, the assistant tools over MCP and `/api/v1/agent`) that leaves an existing series with a calendar rule due on another date than before, and on one of its exception dates, SHALL be refused as a whole with nothing stored: the REST API SHALL answer `409 series_date_taken` with a message naming the date and whether it is already done, was skipped or was moved, the CLI SHALL print that message, and the assistant tools SHALL answer a tool error with that code, the date and the record's state. The server SHALL judge the rows as the write leaves them, so a write that also removes the record of that date SHALL be accepted. Ops a device sends through sync SHALL never be refused for this, so a device's offline edits converge through the repair.

#### Scenario: Completed early, then the series rolls past it
- **WHEN** a series with `every mon, wed, fri` is due Monday the 12th, the user completes Wednesday the 14th early, and later completes Monday
- **THEN** the series is due Friday the 16th, and Wednesday is listed once in Completed

#### Scenario: Two exceptions on two offline devices
- **WHEN** device A skips the occurrence of the 14th and device B moves the occurrence of the 16th, both offline, and both sync
- **THEN** every device shows neither the 14th nor the 16th as a projection and shows the moved occurrence on its new date

#### Scenario: Repair after a late record
- **WHEN** device A, offline, completed the 14th early, and device B completed the current occurrence of the 12th and moved the series to the 14th before receiving A's record
- **THEN** after both sync, the series is due the 16th on every device, written by whichever device repaired first, and Completed holds the 12th and the 14th once each

#### Scenario: Viewer does not repair
- **WHEN** a viewer of a shared project receives a series due on one of its exception dates
- **THEN** the viewer's device writes nothing, and the series moves when a member who may edit it syncs

#### Scenario: Moved back onto a done occurrence
- **WHEN** a series with `every sunday` at 08:00 is due 6 December with its start on 6 December, 29 November is done, and the user picks 29 November in When with All occurrences selected
- **THEN** nothing is written, the toast says 29 November is already done, and the series stays due 6 December with its start on 6 December

#### Scenario: Moved to a free earlier date
- **WHEN** the same series is moved to 22 November, which has no record
- **THEN** the series is due 22 November with its start on 22 November, and the toast says "Date changed"

#### Scenario: Several tasks dropped on a done occurrence
- **WHEN** the same series and a task "Call Ana" are dropped together on 29 November in Upcoming
- **THEN** "Call Ana" is due 29 November, the series stays due 6 December, and the toast says "Date changed · 1 not moved"

#### Scenario: The API moves a series onto a done occurrence
- **WHEN** the same series is due 6 December and a script sends `PATCH /api/v1/tasks/{id}` with `due` 29 November and a new title
- **THEN** the answer is `409 series_date_taken` saying 29 November is already done, and the series keeps its date and its title

#### Scenario: An assistant moves a series onto a skipped occurrence
- **WHEN** 13 December of the same series was skipped and an assistant calls `schedule_tasks` with that date
- **THEN** the tool answers the error `series_date_taken` naming 13 December as skipped, and nothing is written

#### Scenario: The API moves a series to a free date
- **WHEN** a script moves the same series to 22 November, which has no record
- **THEN** the series is due 22 November

#### Scenario: A device syncs a move made offline
- **WHEN** a device that was offline sends through sync a change that put the series on 29 November
- **THEN** the server stores it, and the next device that may edit the series moves it to the next free date
