# Spec Delta

## Purpose
Tracked time on tasks: time entries as a synced entity next to the estimate, one running entry per user, start and stop from rows, the panel, the keyboard and a running indicator, manual entries, tracked totals on rows and in Today, a CSV export and the API routes behind it.

## ADDED Requirements

### Requirement: Time entry entity
A time entry SHALL be an entity of the operation log with `task_id` and `user_id` (fixed at creation), `started_at` (Unix ms), `ended_at` (Unix ms or null while running), `device_id`, an optional `note`, `created_at` and a `deleted_at` tombstone. It SHALL live in the scope of its task, be written offline and queued like any entity, and converge per field by last-writer-wins. Two entries never conflict with each other.

#### Scenario: Two devices track the same task
- **WHEN** device A tracks 20 minutes on a task and device B tracks 30 minutes on the same task, both offline, and both sync
- **THEN** every device holds two entries and the task's tracked total reads 50 minutes

#### Scenario: Invalid values
- **WHEN** a client submits `started_at` as a string, `ended_at` as a negative number, or a `task_id` that is not an id
- **THEN** each operation is rejected as invalid and the entry is unchanged

#### Scenario: Entry on a deleted task
- **WHEN** a task with entries is moved to the Trash
- **THEN** its entries stay stored, are hidden with the task from every list and total, and return with it when it is restored

### Requirement: Time entry authorship
On creation `user_id` SHALL equal the submitting account and SHALL never change; `started_at`, `ended_at`, `note` and `device_id` SHALL be accepted from that account alone; `deleted_at` SHALL be accepted from the author, a project admin and the owner. Viewers of a shared project SHALL NOT create entries. A refused operation SHALL travel back to the author's device with the stored value, so every device converges on it.

#### Scenario: Entry of another member is read-only
- **WHEN** a member of a shared project submits an operation changing another member's entry
- **THEN** the operation is refused with reason `forbidden`, the stored value travels back, and the entry is unchanged on every device

#### Scenario: Viewer cannot track
- **WHEN** a viewer of a shared project submits an entry on one of its tasks
- **THEN** the creation is refused with reason `forbidden` and nothing is stored

### Requirement: One running entry per user
A user SHALL have at most one running entry (`ended_at` null) across all devices. Starting an entry SHALL set the running entry's `ended_at` to the new entry's `started_at` in the same batch. When a device holds two or more running entries of the same user after sync, it SHALL keep the one with the greatest `started_at` (ties by id) and end the others at that start, writing the same values on every device so the repair converges without a prompt.

#### Scenario: Start stops the running one
- **WHEN** an entry on task A has run for 25 minutes and the user starts tracking task B
- **THEN** A's entry ends at B's start with 25 minutes and B's entry is the only running one

#### Scenario: Two devices start while offline
- **WHEN** device A starts task X at 09:00 and device B starts task Y at 09:10, both offline, and both sync at 09:30
- **THEN** every device shows Y running since 09:10 and X's entry closed from 09:00 to 09:10, with no conflict shown

#### Scenario: Stop while offline
- **WHEN** the device is offline and the user stops the running entry
- **THEN** the entry closes at once with the local time, the indicator disappears, and the change is uploaded on the next successful sync

#### Scenario: Stopped on another device
- **WHEN** the running entry is stopped on another device, which syncs
- **THEN** the indicator on this device disappears without a reload and the entry shows the duration the other device wrote

### Requirement: Start and stop from the web app
Every task row's menu and the task panel SHALL offer Start tracking, or Stop tracking while the task's entry runs. In every task list `y` SHALL start tracking the selected task, or stop it when its entry is the running one; with the panel open `y` SHALL act on the open task. A completed or deleted task SHALL offer no start. Completing the task whose entry runs SHALL stop the entry. The actions SHALL work offline and converge as entries do.

#### Scenario: Keyboard start
- **WHEN** a task is selected in Today and the user presses `y`
- **THEN** an entry starts for it, the row's chip reads `0m / 1h` when the task has a one-hour estimate, and the running indicator shows the task's name

#### Scenario: Keyboard stop
- **WHEN** the selected task's entry is the running one and the user presses `y`
- **THEN** the entry ends now and the indicator disappears

#### Scenario: Complete stops tracking
- **WHEN** the user completes the task whose entry has run for 12 minutes
- **THEN** the entry closes with 12 minutes in the same batch as the completion

#### Scenario: Triage keeps its key
- **WHEN** the user presses `y` while processing the Inbox one task at a time
- **THEN** the task is parked in Someday as before and no entry starts

### Requirement: Running indicator
While the user has a running entry the sidebar footer (the bar below 768 px) SHALL show an indicator with the elapsed time (ticking every minute, `h:mm` from one hour) and the task's title, a Stop control, and SHALL open the task on activation. It SHALL be announced once to assistive technology when tracking starts and stops, not on every tick, and SHALL show nothing when no entry runs.

#### Scenario: Indicator on a desktop
- **WHEN** an entry on "Write the report" has run for 1 hour and 5 minutes on a 1280 px screen
- **THEN** the sidebar footer reads "1:05 · Write the report" with a Stop control, and Enter on it opens the task panel

#### Scenario: Indicator on a phone
- **WHEN** the same entry runs on a 390 px screen
- **THEN** the bar shows the elapsed time as a control that opens a sheet with the task's title, Open and Stop

#### Scenario: Nothing running
- **WHEN** no entry is running
- **THEN** the footer and the bar show no tracking control

### Requirement: Time tab and manual entries
The task panel SHALL have a Time tab listing the task's entries, newest first, each with its day, start and end times, duration, note and, in a shared project, who tracked it; a total; and Start or Stop. The user SHALL add an entry by duration (`45m`, `1h30`, `90`) ending now or on a chosen day, or by start and end; edit the start, end and note of their own entries; and delete them. An end before the start SHALL be refused in the form. Entries SHALL be written offline and converge per field.

#### Scenario: Log past work
- **WHEN** the user opens the Time tab, enters `1h30` and saves
- **THEN** one closed entry of 90 minutes ending now appears at the top and the total grows by 1 h 30 m

#### Scenario: Edit an end time offline
- **WHEN** the device is offline and the user changes an entry's end from 10:30 to 10:45
- **THEN** the entry reads 15 minutes longer at once and the change syncs later; a concurrent note edit on another device keeps both changes, because they are separate fields

#### Scenario: End before start
- **WHEN** the user enters an end time earlier than the start
- **THEN** the form shows the error, saves nothing, and the entry is unchanged

#### Scenario: Who tracked what
- **WHEN** two members tracked a task of a shared project
- **THEN** each entry names its author and the total sums both; only the author's entries carry Edit and Delete

### Requirement: Tracked time on rows and in Today
When a task has entries its row SHALL show the tracked total in the estimate chip as `tracked / estimate` (`35m / 1h`), or `35m tracked` without an estimate; a running entry SHALL count to the current minute. Today's page header SHALL show the day's tracked total (the user's entries that started on the local day, running ones to now) beside the planned total (the estimates of the open tasks listed), both computed on the device and both live. Nothing SHALL be stored or sent for these figures.

#### Scenario: Chip with tracked and estimate
- **WHEN** a task estimated at one hour has entries totalling 35 minutes
- **THEN** its row chip reads `35m / 1h` and its accessible name reads "35 minutes tracked of 1 hour estimated"

#### Scenario: Today totals
- **WHEN** Today lists open tasks estimated at 3 hours and the user tracked 1 hour 20 minutes since midnight
- **THEN** the header reads "3h planned · 1h 20m tracked" and the tracked figure grows as the running entry ticks

#### Scenario: Offline totals
- **WHEN** the device is offline
- **THEN** rows and Today show the same totals from local data with no request

### Requirement: Encrypted accounts
For an account with end-to-end encryption the `note` of a time entry SHALL be encrypted on the device like a comment body, while `task_id`, `user_id`, `started_at`, `ended_at`, `device_id`, `created_at` and `deleted_at` SHALL stay plaintext. Server features that show notes (CSV export, the MCP tool) SHALL show a ciphertext note as "[encrypted]" and SHALL never fail because of it.

#### Scenario: Encrypted note
- **WHEN** an encrypted account logs 30 minutes with the note "call with the client"
- **THEN** the `note` operation carries ciphertext, `started_at` and `ended_at` are plaintext, and the server's CSV shows the minutes with "[encrypted]" in the note column

### Requirement: Time entry read routes
`GET /api/v1/time-entries` SHALL list the live entries the caller can read, newest first, with the filters `task`, `from`, `to` (local days in the `tz` parameter's zone, else UTC), `running=true` and `format=csv`; `GET /api/v1/tasks/{id}/time-entries` SHALL list one task's. Both require authentication and are allowed to every token scope. A task the caller cannot read SHALL answer 404.

#### Scenario: List a task's entries
- **WHEN** a client requests `GET /api/v1/tasks/{id}/time-entries` for a task with three entries, one deleted
- **THEN** the response lists the two live entries, newest first, each with `id`, `taskId`, `userId`, `startedAt`, `endedAt`, `minutes`, `note` and `deviceId`

#### Scenario: Anonymous request
- **WHEN** a request without credentials asks for `/api/v1/time-entries`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Foreign task
- **WHEN** a client lists the entries of a task id the caller cannot read, or that does not exist
- **THEN** the response is 404 `not_found`

#### Scenario: Bad range
- **WHEN** a client requests `from=2026-13-01`
- **THEN** the response is 400 `invalid_input` naming `from`

### Requirement: Time entry write routes
`POST /api/v1/time-entries` SHALL start an entry (`taskId` alone) or log a closed one (`startedAt` and `endedAt`, optional `note`), `POST /api/v1/time-entries/stop` SHALL stop the caller's running entry, `PATCH /api/v1/time-entries/{id}` SHALL change `startedAt`, `endedAt` and `note`, and `DELETE /api/v1/time-entries/{id}` SHALL tombstone one. All require authentication, write through the operation log, wake the caller's devices, and refuse read and agent tokens.

#### Scenario: Start from the API
- **WHEN** a full token POSTs `{"taskId":"<id>"}` to `/api/v1/time-entries` while another entry runs
- **THEN** the response is 201 with the new running entry, the previous entry is closed at the new start in the same batch, and the user's devices show both after their next sync

#### Scenario: Log a closed entry
- **WHEN** a client POSTs `{"taskId":"<id>","startedAt":1760950800000,"endedAt":1760954400000,"note":"review"}`
- **THEN** the response is 201 with a one-hour entry

#### Scenario: Anonymous write
- **WHEN** a request without credentials POSTs to `/api/v1/time-entries`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Read token on a write
- **WHEN** a `read` token POSTs to `/api/v1/time-entries/stop`
- **THEN** the response is 403 `insufficient_scope` and no entry changes

#### Scenario: End before start
- **WHEN** a client POSTs an entry whose `endedAt` is smaller than `startedAt`, or PATCHes one into that state
- **THEN** the response is 400 `invalid_input` naming the fields and nothing is written

#### Scenario: Unknown or foreign task
- **WHEN** a client starts an entry on a task id that does not exist or that the caller cannot read
- **THEN** the response is 404 `not_found` and nothing is written

#### Scenario: Nothing to stop
- **WHEN** a client POSTs to `/api/v1/time-entries/stop` while no entry of the caller runs
- **THEN** the response is 404 `not_found` with a message saying no entry is running

#### Scenario: Another member's entry
- **WHEN** a member PATCHes or DELETEs an entry another member created
- **THEN** the response is 403 `forbidden` and the entry is unchanged

### Requirement: CSV export of entries
The CSV (`format=csv` on the list route, the Statistics action and `ot time export`) SHALL have a header row and the columns `date`, `start`, `end`, `minutes`, `task`, `project`, `labels`, `note`, then one column per custom field of the task's project; one row per live entry of a live task, UTF-8, times in the caller's zone. A running entry SHALL have an empty `end` and minutes up to the export time.

#### Scenario: Export a week
- **WHEN** the user exports entries from 2026-10-12 to 2026-10-18 with two entries on a task in "Client A" carrying the custom field "Rate"
- **THEN** the file has a header, two rows with the task's title, "Client A", its labels joined by `;` and a "Rate" column, and opens in a spreadsheet without re-encoding

#### Scenario: Export from the device
- **WHEN** the user chooses Export time entries in Statistics while offline
- **THEN** the file is produced from local data with the same columns as the server's CSV
