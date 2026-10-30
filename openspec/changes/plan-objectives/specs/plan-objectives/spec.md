## ADDED Requirements

### Requirement: Objective entity
The product SHALL store objectives as a personal entity `objective` with these fields:
- `title`: 1 to 140 characters on one line, user-written content;
- `period`: a quarter `YYYY-Qn` or an ISO week `YYYY-Www`, validated with the period rules of OpenSpec `time-sectors`;
- `position`;
- `done_at`: Unix ms, 0 when open;
- `created_at`;
- `deleted_at`: a tombstone.

Objectives SHALL resolve to the author's personal scope and sync to that user's devices only. They SHALL be creatable and editable offline through the outbox, converge per field by last-writer-wins, be included in the JSON export with tombstones, derive no activity event, and be added only, never renamed, in the op schema. An invalid title or period SHALL be refused on every write path and change nothing.

#### Scenario: Add offline
- **WHEN** the device is offline and the user adds the quarterly objective "Ship the 1.0 release"
- **THEN** the card appears at once, and the user's other devices show it after this device syncs

#### Scenario: Concurrent edits
- **WHEN** the phone marks an objective done while the laptop, offline, renames it, and both sync
- **THEN** every device shows the new title and the objective done, each field by its own latest write

#### Scenario: Never shared
- **WHEN** a user who is a member of a shared workspace adds an objective
- **THEN** no other member's device receives it

#### Scenario: Invalid period
- **WHEN** a client writes an objective with the period `2026-11`
- **THEN** the write is refused as invalid, because objectives are quarterly or weekly, and nothing changes

#### Scenario: Older server
- **WHEN** a device syncs objectives with a server that does not know the entity
- **THEN** the ops are refused as unknown, the device keeps its local objectives, and the rest of the batch still syncs

### Requirement: Few objectives per period
A period SHALL hold at most 5 open objectives. The client SHALL hide Add at the limit and say why. A REST create, or a change of period into a full period, SHALL be refused with `409 too_many_objectives`. When offline devices together exceed the limit, every device SHALL show all of them, SHALL not offer Add until fewer than 5 are open, and SHALL delete nothing by itself.

#### Scenario: The sixth is refused
- **WHEN** this week has five open objectives
- **THEN** the strip shows no Add for this week and says "Five is plenty. Finish or drop one first."

#### Scenario: Two devices offline
- **WHEN** this week has four open objectives and two offline devices each add one, then both sync
- **THEN** every device shows six objectives for this week and no Add control, and none is removed

### Requirement: Objectives strip in Plan
While objectives are on, the Plan mode SHALL show an Objectives strip inside its content, above the columns:
- this quarter's objectives;
- this week's (the viewer's This week of OpenSpec `time-sectors`);
- next week's as well when the span starts in next week.

Each objective SHALL be a one-line card with a done checkbox and its title. A group under the limit SHALL end with Add. Cards SHALL be editable in place with Enter, toggled done with Space, dropped with Delete after a confirmation and with Undo, and reordered by drag or Alt+Up/Down, each change written as one operation batch. A done objective SHALL stay, struck through, until its period ends, and objectives of past periods SHALL not be shown. Whether the strip is collapsed SHALL be remembered per device and never synced. Below 640 px the strip SHALL be one summary line that opens a sheet with the same groups. The strip SHALL add no chrome row, no scroll region and no shortcut.

#### Scenario: Plan the week with the quarter in view
- **WHEN** objectives are on, Q4 2026 has three objectives and week 44 has two, and the user opens the Plan on Wednesday 2026-10-28
- **THEN** the strip shows "Q4 2026" with three cards and "This week" with two above the columns, and Tab reaches the cards before the first column

#### Scenario: Done stays visible this week
- **WHEN** the user presses Space on a weekly card
- **THEN** it is struck through and stays in the strip until the week ends, and the next week's strip does not show it

#### Scenario: Phone
- **WHEN** the Plan is opened on a 390 px screen
- **THEN** one line reads "Q4: 3 · This week: 2", and tapping it opens a sheet with the cards

#### Scenario: Encrypted account
- **WHEN** an encrypted account's device shows the strip
- **THEN** the titles are decrypted on the device, and the operations that left it carried ciphertext titles

### Requirement: Objectives carried only on request
Objectives of a past period SHALL never be moved, completed or deleted without the user's action. They SHALL be offered once in the weekly review (OpenSpec `weekly-review` "Objectives in the weekly review"), and SHALL stay in the export and the API.

#### Scenario: A week ends
- **WHEN** week 44 ends with one open weekly objective and the user opens the Plan in week 45
- **THEN** the objective is not in the strip, its period is still `2026-W44`, and no operation was written

### Requirement: Objectives switch
Each user SHALL have the preference `objectives`, an additive user_prefs field. Empty or any unknown value means off, `on` means on, and a client SHALL keep an unknown value unchanged. It SHALL be written as an operation, synced to that user's devices only, editable offline, and converging by last-writer-wins. Settings → Account → How you work SHALL show it as a switch below the three choices, off by default whichever choice is made. While it is off, the Plan SHALL show no strip and the weekly review no Objectives section. Objectives SHALL be kept and stay available through the export, REST, the CLI and MCP.

#### Scenario: Simple lists see nothing new
- **WHEN** a user who never turned the switch on opens the Plan and the weekly review
- **THEN** neither shows anything about objectives

#### Scenario: Turned off keeps the data
- **WHEN** a user with objectives turns the switch off and later on again
- **THEN** the same objectives are shown, and no operation was written on them
