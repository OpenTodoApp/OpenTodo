## ADDED Requirements

### Requirement: Verified against real calendar servers
The calendar sync guide SHALL carry a verification table with one row per calendar server and one column per behaviour. The servers are iCloud, Fastmail, Nextcloud and Google Calendar. The behaviours are connect and discovery, task to event, event move or resize back to the task, event deletion back, and incremental sync. Each row SHALL name the server version or the date of the run. Each cell SHALL state `works` with notes, `not supported by <server>` with the reason, `defect #<issue>`, or `not verified`. A cell SHALL say `works` only when the step was performed against that server and the server's recorded responses are kept, sanitised, as replay fixtures for the calendar sync tests. A release tagged 1.0 or later SHALL have no `not verified` cell, and the repository check SHALL fail when it does. Sync keeps writing through operations with device `calsync:<connection-id>`, so offline devices receive the result on their next sync and fields converge by last-writer-wins as before.

#### Scenario: Fastmail run recorded
- **WHEN** a maintainer connects a Fastmail calendar, schedules a task, moves the event in Fastmail and deletes another event
- **THEN** the Fastmail row shows `works` for each column with the date, and the recorded responses replay in `go test ./internal/calsync/...`

#### Scenario: Replay regression
- **WHEN** a contributor changes how the connection reads a `sync-collection` response so that a recorded iCloud response loses a changed event
- **THEN** the replay test fails and names the server and the fixture

#### Scenario: Release gate
- **WHEN** the repository checks run on a tree whose version is 1.0.0 and the Google Calendar row still has a `not verified` cell
- **THEN** the check fails and names the row and the column
