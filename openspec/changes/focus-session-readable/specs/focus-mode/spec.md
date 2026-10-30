## MODIFIED Requirements

### Requirement: Timer state stays on the device
The running session's bookkeeping (phase, time accumulated before a pause, cycle position during a break, countdown length before a resume, and the session itself while it is paused or on a break) SHALL be stored in the device's local store so it survives a reload and a closed tab, SHALL never be synced, exported or sent to the server, and SHALL be cleared on sign-out. Only the facts described in "Session details on the time entry" (mode, session number and planned end of a work stretch) SHALL leave the device, as fields of that stretch's time entry. Two devices never share a session, so there is nothing to converge; the time entry is what other devices see.

#### Scenario: Closed tab
- **WHEN** the user closes the tab during a session and opens the app again an hour later
- **THEN** the Focus screen shows the session as ended (a timed session) or as still counting (Flowtime), as the clock says, and offers the done state

#### Scenario: Not in the export
- **WHEN** the user exports their data during a session
- **THEN** the export holds the time entry with its mode, session number and planned end, when time tracking is present, and nothing else about the running timer: no phase, pause or accumulated time

#### Scenario: Another device
- **WHEN** a session runs on the laptop and the user opens the Focus screen on the phone
- **THEN** the phone shows no running session; the laptop's entry is visible on the task after sync

#### Scenario: Paused session stays private
- **WHEN** the user pauses a Pomodoro session with 12 minutes left and a client reads the running entry from the API
- **THEN** the API reports no running entry and nothing on the server says that 12 minutes were left

## ADDED Requirements

### Requirement: Session details on the time entry
When the Focus screen starts or resumes a work stretch and time tracking is present, the time entry it writes SHALL carry, in the same batch, `focus_mode` (`pomodoro`, `flowtime` or `countdown`), `focus_session` (the work session's number in the Pomodoro cycle, `0` otherwise) and `planned_end_at` (the moment the stretch ends if nothing changes, null for Flowtime). A resume after a pause SHALL start a new entry whose `planned_end_at` is the resume time plus the time that was left. A change to the running stretch's length SHALL write `planned_end_at` again. The fields SHALL be written offline through the outbox like the entry's other fields. Breaks SHALL write nothing, and entries started outside the Focus screen SHALL keep the defaults (`""`, `0`, null).

#### Scenario: Third Pomodoro
- **WHEN** the mode is Pomodoro with 25 minute work sessions and the user starts the third work session at 10:00
- **THEN** the running entry carries `focus_mode: "pomodoro"`, `focus_session: 3` and `planned_end_at` 10:25, and another device shows the same after sync

#### Scenario: Resume after a pause
- **WHEN** the user pauses that session at 10:10 and resumes at 10:20
- **THEN** the first entry ends at 10:10, and the new running entry carries session 3 and `planned_end_at` 10:35

#### Scenario: Flowtime
- **WHEN** the user starts a Flowtime session
- **THEN** the running entry carries `focus_mode: "flowtime"`, `focus_session: 0` and no planned end

#### Scenario: Offline session
- **WHEN** the device is offline and the user runs a Countdown session of 40 minutes
- **THEN** the entry and its three fields are stored locally at once and upload together on the next successful sync

#### Scenario: Without time tracking
- **WHEN** time cannot be logged on the device
- **THEN** no entry and therefore none of the three fields is written, as "Sessions are time entries" says for the degraded case
