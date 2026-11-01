## MODIFIED Requirements

### Requirement: Sessions are time entries
Where time tracking (`time-tracking`, collection `time_entries`) is present, starting a work session SHALL start a time entry on the task, pausing SHALL end it and resuming SHALL start a new one (time tracking has no paused entry: each stretch of work is one entry), and completing the task, leaving the session, ending a Flowtime session or starting a break SHALL stop it; breaks SHALL never be logged. The entries are ordinary ops: written offline through the outbox and converging per field. When time cannot be logged the timer SHALL work the same and write nothing, and the failure SHALL be reported in a toast: a start failure says the session is not being tracked, a stop failure says the minutes may not be logged correctly, and each names the underlying error.

#### Scenario: Session logged
- **WHEN** time tracking is present and the user runs a 25 minute session on "Write the report", then completes it
- **THEN** the task has one time entry of 25 minutes started when the session started, and another device shows it after sync

#### Scenario: Pause is not work
- **WHEN** the user pauses for ten minutes in the middle of a session and resumes
- **THEN** no time entry covers the ten minutes: the pause ended the session's entry and resuming started a second one, as the time-tracking capability records each stretch of work

#### Scenario: Break not logged
- **WHEN** a Pomodoro work session ends and its break runs for five minutes
- **THEN** no time entry covers the break

#### Scenario: Degraded without time tracking
- **WHEN** time cannot be logged on the device (the time-tracking capability is not available)
- **THEN** sessions start, pause and end exactly as above, the done state shows the time worked, and no op is written for the session

#### Scenario: Entry stopped elsewhere
- **WHEN** another device stops the running time entry of the session, which syncs
- **THEN** the Focus screen shows the session as paused with the reason, and Space starts a new entry

#### Scenario: Start failure is shown
- **WHEN** the time entry cannot be started but the work session starts
- **THEN** the timer runs, the session has no entry, and a toast says the session is not being tracked

#### Scenario: Stop failure is shown
- **WHEN** the session's time entry cannot be stopped when the session pauses or ends
- **THEN** the session changes as usual and a toast says the minutes may not be logged correctly
