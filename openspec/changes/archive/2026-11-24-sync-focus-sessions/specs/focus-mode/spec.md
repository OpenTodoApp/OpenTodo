## MODIFIED Requirements

### Requirement: Sessions are time entries
Where time tracking (`time-tracking`, collection `time_entries`) is present, starting a work session SHALL start a time entry on the task, pausing SHALL end it and resuming SHALL start a new one (time tracking has no paused entry: each stretch of work is one entry), and completing the task, leaving the session, ending a Flowtime session or starting a break SHALL stop it; breaks SHALL never be logged. The entries are ordinary ops: written offline through the outbox and converging per field. Pausing or ending a session on a device other than the one that started its entry SHALL stop that entry the same way. When time cannot be logged the timer SHALL work the same and write no time entry, and the failure SHALL be reported in a toast: a start failure says the session is not being tracked, a stop failure says the minutes may not be logged correctly, and each names the underlying error.

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
- **THEN** sessions start, pause and end exactly as above, the done state shows the time worked, and no time entry is written; the session itself still syncs as "Session syncs across the user's devices" says

#### Scenario: Entry stopped elsewhere
- **WHEN** another device stops the running time entry of the session from time tracking, which syncs
- **THEN** the Focus screen shows the session as paused with the reason, and Space starts a new entry

#### Scenario: Paused on another device
- **WHEN** a session started on the laptop runs and the user pauses it on the phone
- **THEN** the phone ends the laptop's running entry at the pause, and after sync both devices show the session paused with no running entry

#### Scenario: Start failure is shown
- **WHEN** the time entry cannot be started but the work session starts
- **THEN** the timer runs, the session has no entry, and a toast says the session is not being tracked

#### Scenario: Stop failure is shown
- **WHEN** the session's time entry cannot be stopped when the session pauses or ends
- **THEN** the session changes as usual and a toast says the minutes may not be logged correctly

## ADDED Requirements

### Requirement: Session syncs across the user's devices
A person SHALL have one Focus session across their devices. Its shared state (the task, the mode, the phase, when the phase started, whether its clock runs and since when, the time accumulated before a pause, the planned length, the Pomodoro cycle position, the break kind, the stretch's time entry and how the last run ended) SHALL be stored as one additive field, `focus_run`, on the user's synced preferences row: it carries ids and times only, no content, reaches only the person's own devices, and is not encrypted. Starting, pausing, resuming, ending, taking or ending a break, extending, completing the task on the device, and choosing or leaving a task SHALL write it, offline included: the device shows the change at once and the op waits in the outbox. Every device SHALL compute the clock from the stored times and SHALL never write while a session merely runs; the end of a timed run, a pause because the entry was stopped elsewhere, the end because the task was completed or trashed elsewhere, and "Not now" on the break reminder SHALL be derived on each device and not written. Concurrent changes SHALL converge by last-writer-wins on the whole field, so every device ends with the later change and never a mix of two sessions. The last Countdown length and the break reminder's "Not now" stay on the device. A client that cannot read the stored value SHALL ignore it and keep it. The device that made the last written change owns the session: only it SHALL play the end sound, show the session end notification, play background noise, show the break reminder and hand the session to a native shell's lock-screen timer; other devices SHALL show the same state silently. The export SHALL carry `focus_run` with the other preferences, an import SHALL not restore it, and sign-out SHALL clear only the device's copy.

#### Scenario: Started on the laptop, seen on the phone
- **WHEN** the user starts a 25 minute Pomodoro on "Write the report" on the laptop at 10:00 and opens the Focus screen on the phone at 10:10, after sync
- **THEN** the phone shows "Write the report" with 15:00 left and counting, and nothing is written while it counts

#### Scenario: Paused on the phone
- **WHEN** the user pauses that session on the phone at 10:12 and the laptop syncs
- **THEN** the laptop shows the session paused with 13:00 left, and resuming on either device continues from 13:00

#### Scenario: Ended on time
- **WHEN** the session started on the laptop reaches its end while both devices are open
- **THEN** both show the done state; only the laptop plays the sound or shows the notification, and neither writes the end to `focus_run`

#### Scenario: The phone takes over
- **WHEN** the user pauses and resumes the laptop's session on the phone and it then ends
- **THEN** the phone plays the sound or shows the notification, and the laptop shows the done state silently

#### Scenario: Two devices start offline
- **WHEN** the laptop starts a session on "Write the report" and, later, the phone starts one on "Email Anna", both offline, and both then sync
- **THEN** every device shows the session on "Email Anna", the later change, and no device shows a mix of the two

#### Scenario: Offline
- **WHEN** the phone is offline and the user starts a session there
- **THEN** the timer runs at once and the session reaches the other devices on the phone's next successful sync

#### Scenario: Sleeping laptop
- **WHEN** the laptop sleeps during a session, the user starts another session on the phone, and the laptop wakes after the first session's planned end
- **THEN** the laptop shows the first session as ended until it syncs, then the phone's session, and the phone's session is not replaced

#### Scenario: Closed tab
- **WHEN** the user closes the tab during a session and opens the app again an hour later
- **THEN** the Focus screen shows the session as ended (a timed session) or as still counting (Flowtime), as the clock says, and offers the done state

#### Scenario: Restore
- **WHEN** the user imports an export made during a session
- **THEN** the import restores the preferences without `focus_run`, and no session starts

#### Scenario: Older client
- **WHEN** a client that does not know `focus_run` runs a session
- **THEN** it keeps its session on the device as before, and other devices keep the last written value

## REMOVED Requirements

### Requirement: Timer state stays on the device
**Reason**: The session is now shared by the person's devices (#1943).
**Migration**: "Session syncs across the user's devices" stores the shared state on the preferences row; the Countdown length and the break reminder's "Not now" stay on the device, the closed-tab scenario moves there, and a session already running on a device keeps running there and is written with its next change.
