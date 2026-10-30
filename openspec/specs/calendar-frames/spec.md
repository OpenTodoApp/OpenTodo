# calendar-frames Specification

## Purpose
Defines calendar frames: personal, recurring background windows such as "Deep work" on weekday mornings, how their occurrences are derived, how Day and Week draw them behind the blocks without changing placement or capacity, how a person plans tasks into one, how frames are managed, and their API, CLI and assistant surface.

## Requirements

### Requirement: Frame entity
A user SHALL be able to keep frames: personal records with a title, the ISO weekdays they repeat on, a start and an end wall time (`HH:MM`, end after start on the same day), a colour, an optional planning source (a project, label or saved view, by id), an optional first and last date, a position and a deletion tombstone. Frames SHALL be written through the operation log, resolve to the author's personal scope (synced to the author's own devices, never to project members), be editable offline, converge per field by last-writer-wins, and be included in the export. The server SHALL reject a malformed weekday list or time. A frame whose end is not after its start SHALL be kept, not drawn, and marked as needing a fix in the Frames dialog. A user SHALL hold at most 50 live frames.

#### Scenario: Create a frame offline
- **WHEN** the device is offline and the user creates "Deep work" on Monday to Friday from 09:00 to 11:00
- **THEN** the Week shows the frame on its five days at once and the frame reaches the user's other devices after the next sync

#### Scenario: Concurrent edits converge
- **WHEN** the laptop changes a frame's end to 11:30 and the phone renames it to "Focus", both offline, and both sync
- **THEN** every device shows "Focus" from 09:00 to 11:30

#### Scenario: Times that cross after a conflict
- **WHEN** one device sets a frame's start to 12:00 and another its end to 11:00, and both sync
- **THEN** the frame is not drawn on any device, the Frames dialog shows it with "Times need fixing", and no operation is written until the user edits it

#### Scenario: Invalid value
- **WHEN** a client submits `weekdays` of `"1,8"` or a `start` of `"9:5"`
- **THEN** the write is rejected as invalid and the frame is unchanged

#### Scenario: Personal on a shared project
- **WHEN** Ana creates a frame whose source is the shared project "Launch"
- **THEN** Ben, a member of "Launch", never receives the frame

#### Scenario: Limit
- **WHEN** a user with 50 live frames adds another
- **THEN** the form refuses it with a message that 50 frames is the limit, and nothing is written

### Requirement: Frame occurrences
A frame SHALL occur on every date whose ISO weekday is in its weekday list, on or after its first date when set and on or before its last date when set, from its start to its end in the viewer's zone as floating wall times. Occurrences SHALL be computed on the device from local data for the shown range, never stored, and SHALL be identical in the web client and the server's Go implementation, pinned by shared test vectors.

#### Scenario: Weekdays and a date range
- **WHEN** a frame repeats on Tuesday and Thursday from 2026-11-03 until 2026-11-12
- **THEN** it occurs on 2026-11-03, 05, 10 and 12 and on no other date

#### Scenario: Floating while travelling
- **WHEN** the user's device zone changes from Europe/Berlin to America/New_York
- **THEN** a 09:00 frame is drawn at 09:00 on the New York grid

#### Scenario: Same in Go and TypeScript
- **WHEN** the shared vectors are run by the web tests and `go test ./internal/frames/...`
- **THEN** both produce the same occurrences for every case

### Requirement: Frames drawn behind the Day and Week grid
Day and Week SHALL draw each frame occurrence as a background band across its day column from its start to its end, in a soft tint of its colour lighter than a task block's fill, with its title and time range at the top in the faint tone. Bands SHALL lie below task blocks, event blocks, slots and the now line; SHALL take no pointer or drop interaction except on their title; SHALL not change where a dropped or keyboard-placed task lands; SHALL not count toward the day's capacity; and SHALL be dimmed on days before today. Overlapping frames SHALL share the column width side by side. A day without frames SHALL look exactly as before. Rendering SHALL work offline from local data.

#### Scenario: A task inside a frame
- **WHEN** a "Deep work" frame runs 09:00 to 11:00 and a task is due today at 09:30 for one hour
- **THEN** the task block is drawn above the band with its usual fill and edge, and the day's capacity counts the task's hour only

#### Scenario: Drop inside a frame
- **WHEN** the user drags a task onto 10:15 inside a frame
- **THEN** the task is due at 10:15, exactly as without the frame

#### Scenario: Two frames overlap
- **WHEN** "Admin" runs 16:00 to 17:00 and "Calls" 16:30 to 17:30 on the same day
- **THEN** both bands are visible side by side with their titles

#### Scenario: Without frames
- **WHEN** the user has no frame
- **THEN** Day and Week render exactly as before and no frame control appears on the grid

### Requirement: Plan from a frame
A frame's title SHALL be a button reachable with Tab that opens a popover (a bottom sheet below 640 px) with the title, the repeat and times, the source's name, and the actions Plan from this frame, Edit and Delete. Plan from this frame SHALL open the planning list with the frame's source (keeping the current source when the frame has none or its source no longer exists) and make that occurrence the placement target while the list stays open: `s` on a list task SHALL then propose the first free 15-minute start inside the occurrence where the task's estimate (30 minutes when unestimated) fits between other blocks, falling back to the usual proposal when none fits. Nothing SHALL be written until the user confirms the placement. Delete SHALL tombstone the frame and offer Undo.

#### Scenario: Plan deep work
- **WHEN** the "Deep work" frame (09:00–11:00, source the label "deep") has a 09:00–09:30 task inside it and the user chooses Plan from this frame and presses `s` on a 45-minute task in the list
- **THEN** the list shows the label "deep", the placement proposes 09:30, and Enter makes the task due at 09:30

#### Scenario: Nothing fits
- **WHEN** the frame is already full and the user presses `s` on a 60-minute task
- **THEN** the placement proposes the usual start outside the frame and nothing is written until Enter

#### Scenario: Source deleted
- **WHEN** the frame's source label was deleted on another device and the user chooses Plan from this frame
- **THEN** the planning list keeps its current source and the frame's stored source is unchanged

#### Scenario: Keyboard only
- **WHEN** the user tabs to a frame's title and presses Enter, then chooses Delete
- **THEN** the frame disappears from every day with an Undo toast, and Undo brings it back

### Requirement: Managing frames
The Day and Week overflow menu SHALL offer Frames…, opening a dialog that lists the user's frames in their order with Add, Edit, Delete and reordering by drag or Alt+Up and Alt+Down. The form SHALL offer a title, weekday toggles starting on the user's first day of the week, start and end times in the user's time format in 15-minute steps, a colour, an optional planning source chosen with the Combobox, and optional first and last dates under More options. The command palette SHALL offer New frame. When the grid offers an empty-slot menu (OpenSpec change `calendar-clarity`), it SHALL include New frame here…, prefilled with the slot's weekday and start and an end one hour later. No frame control SHALL appear in Today, lists or the sidebar.

#### Scenario: Create from the overflow menu
- **WHEN** the user opens Frames… in the Week, chooses Add, enters "Admin", toggles Monday to Thursday, 16:00 to 16:45, and saves
- **THEN** the dialog lists "Admin · Mon–Thu · 16:00–16:45" and the bands appear on those days

#### Scenario: Create from an empty slot
- **WHEN** the user opens the empty-slot menu on Wednesday 14:00 and chooses New frame here…
- **THEN** the form opens with Wednesday toggled, 14:00 to 15:00, and the title focused

#### Scenario: Week starting on Sunday
- **WHEN** the first day of the week is `sun`
- **THEN** the weekday toggles start with Sunday and the stored list still uses ISO numbers

### Requirement: Frames on a phone
Below 640 px the Week's vertical agenda SHALL show a frame occurrence as a heading line inside its day, with its colour dot, title and time range in the faint tone, placed before the first timed task that starts inside it or at its start time's position otherwise. It SHALL not add a row of chrome, and SHALL open the frame's sheet when tapped.

#### Scenario: Agenda heading
- **WHEN** the Week is opened at 390 px and Tuesday has "Deep work" 09:00–11:00 and a task at 09:30
- **THEN** Tuesday's list shows "Deep work · 09:00–11:00" above the 09:30 task, and tapping it opens the frame's sheet

### Requirement: Frames API
The server SHALL offer `GET /api/v1/frames`, `POST /api/v1/frames`, `PATCH /api/v1/frames/{id}` and `DELETE /api/v1/frames/{id}`, each requiring a signed-in session or token. Reads SHALL accept every token scope; writes SHALL be refused to `read` and `agent` tokens. Writes SHALL be applied as operations with `ApplyStrict` and wake the user's devices. The response SHALL carry each frame's fields and, on an encrypted account, its title as stored with `"encrypted": true`; a plaintext title write on an encrypted account SHALL be refused. The CLI SHALL offer `ot frames`, `ot frames add` and `ot frames rm`, and the agent tools SHALL offer a read tool listing frame occurrences for a date range, with titles marked as untrusted text.

#### Scenario: Unauthenticated request
- **WHEN** a request to `GET /api/v1/frames` carries no session or token
- **THEN** the server answers 401 with the error envelope

#### Scenario: Read token cannot write
- **WHEN** a `read` token sends `POST /api/v1/frames`
- **THEN** the server answers 403 and no operation is written

#### Scenario: Invalid frame
- **WHEN** a client posts a frame with `weekdays` `"0,1"` or an end before its start
- **THEN** the server answers 422 with the error envelope naming the field, and nothing is written

#### Scenario: Create from the CLI
- **WHEN** the user runs `ot frames add "Deep work" --days mon-fri --from 09:00 --to 11:00`
- **THEN** the frame is created as operations, and the web app shows it after its next sync

#### Scenario: Assistant reads frames
- **WHEN** an assistant calls the frames read tool for next week on an encrypted account without the local bridge
- **THEN** it receives the occurrences with their times and "Encrypted frame" in place of each title
