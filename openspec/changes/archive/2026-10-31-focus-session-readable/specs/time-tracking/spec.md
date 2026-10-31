## ADDED Requirements

### Requirement: Focus details on a time entry
A time entry SHALL have three additive, plaintext fields: `focus_mode` (a string, default `""`), `focus_session` (an integer 0 to 99, default `0`) and `planned_end_at` (a Unix millisecond instant not before `started_at`, or null, the default). They SHALL be accepted from the entry's author alone, converge per field by last-writer-wins, travel in the JSON export and the entry representations (as `focus: {mode, session, plannedEndAt}`, or `null` while `focus_mode` is empty), and SHALL NOT appear in the CSV export. A value outside these bounds SHALL be refused as an invalid operation. A reader SHALL keep and show an unknown `focus_mode` value rather than refuse it.

#### Scenario: Older entry
- **WHEN** a client reads an entry written before this change
- **THEN** its `focus` is `null` and nothing else about it changes

#### Scenario: Invalid planned end
- **WHEN** a client submits `planned_end_at` earlier than the entry's `started_at`, or `focus_session` of 120
- **THEN** the operation is rejected as invalid and the entry is unchanged

#### Scenario: Another member edits the details
- **WHEN** a member of a shared project submits `planned_end_at` on another member's entry
- **THEN** the operation is refused with reason `forbidden` and the stored value travels back

#### Scenario: Concurrent extend and stop
- **WHEN** the laptop writes a later `planned_end_at` on the running entry while the phone, offline, stops it, and both sync
- **THEN** every device shows the entry stopped at the phone's time with the laptop's `planned_end_at`, the same on every device

### Requirement: Running entry route
`GET /api/v1/time-entries/running` SHALL answer 200 `{entry, serverTime}` where `entry` is the caller's own running entry in the list routes' shape plus `taskTitle` and `focus`, or `null` when none runs. It SHALL require authentication, SHALL be allowed to every token scope, and SHALL never return another member's entry. For an end-to-end encrypted account `taskTitle` SHALL be the stored ciphertext.

#### Scenario: A panel reads the session
- **WHEN** a `read` token requests the route while the user's third Pomodoro runs since 10:00 on "Write the report"
- **THEN** the response is 200 with the entry, `taskTitle` "Write the report", `focus: {"mode":"pomodoro","session":3,"plannedEndAt":<10:25>}` and `serverTime`

#### Scenario: Nothing running
- **WHEN** the user is on a break or no entry runs
- **THEN** the response is 200 `{"entry": null, "serverTime": …}`

#### Scenario: Another member's running entry
- **WHEN** a member of a shared project has a running entry on a shared task and the caller requests the route
- **THEN** that entry is not returned

#### Scenario: Anonymous request
- **WHEN** a request without credentials asks for `/api/v1/time-entries/running`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Wrong method
- **WHEN** a client sends `POST /api/v1/time-entries/running`
- **THEN** the response is 405 with the JSON error envelope and nothing is written
