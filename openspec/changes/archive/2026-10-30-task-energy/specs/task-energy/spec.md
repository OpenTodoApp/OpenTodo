## ADDED Requirements

### Requirement: Energy field
A task SHALL have an optional energy, one of `deep`, `medium` or `low`, stored as the additive field `energy` with `""` meaning none. It SHALL be written through the operation log, editable offline, and converge per field by last-writer-wins. The server SHALL reject any other value as invalid. A client reading a value it does not know SHALL treat it as none and SHALL NOT rewrite it, and a client that does not know the field SHALL pass it through unchanged. The value SHALL NOT be content: it is never encrypted on an end-to-end encrypted account. It SHALL be included in the export.

#### Scenario: Set energy offline
- **WHEN** the device is offline and the user sets "Write the report" to Deep
- **THEN** the task shows Deep at once and the change is uploaded on the next successful sync

#### Scenario: Concurrent edits converge
- **WHEN** device A sets a task's energy to Low and device B sets it to Deep, both offline, and both sync
- **THEN** every device shows the value written with the greater timestamp

#### Scenario: Separate from other fields
- **WHEN** device A sets the energy while device B changes the estimate, both offline, and both sync
- **THEN** every device shows A's energy and B's estimate

#### Scenario: Invalid value
- **WHEN** a client submits `energy` as `high`, a number or `null`
- **THEN** the operation is rejected as invalid and the energy is unchanged

#### Scenario: Encrypted account
- **WHEN** an end-to-end encrypted account sets a task's energy to Low
- **THEN** the operation carries `low` in clear, while the title stays encrypted

### Requirement: Energy levels switch
Settings › Account › How you work SHALL have an **Energy levels** row with a switch, stored as the synced additive preference `user_prefs.energy` (`on`; empty or unknown reads as off and is not rewritten), off by default in every mode. While it is off, the task page, the docked panel and the row menu SHALL NOT offer Energy, and quick add SHALL NOT parse or suggest the energy token. A task that has an energy SHALL still show it where set, with a way to clear it, whatever the switch, and the filter terms SHALL work whatever the switch. The preference SHALL be written offline and converge by last-writer-wins.

#### Scenario: Simple lists see nothing new
- **WHEN** a user in Lists only mode, who never turned the switch on, opens a task's Add menu and types `Call ~low` in quick add
- **THEN** the menu offers no Energy, and the task is titled `Call ~low` with no energy

#### Scenario: Turned on follows the account
- **WHEN** the user turns Energy levels on on the laptop, then opens the phone after sync
- **THEN** the phone's task page offers Energy in its Add menu

#### Scenario: Value set elsewhere stays visible
- **WHEN** the switch is off and a collaborator sets a shared task to Deep
- **THEN** the task shows Deep in its facts and its row, and the user can clear it

### Requirement: Energy entry and display
While the switch is on, the task page and the docked panel SHALL offer Energy in the Add menu of the Details group, and a task with an energy SHALL show an Energy row there with Deep, Medium and Low as one choice and Clear, reachable with the keyboard. The row menu SHALL offer an Energy submenu (Deep, Medium, Low, None) after Priority. A task row SHALL show the energy as one muted word only when set, as a row property a saved view can hide; a task without energy SHALL show nothing for it. On a phone the row's end cell SHALL be unchanged and the energy SHALL be on the task page. Users who may not edit a task (viewers of a shared project) SHALL see the value and SHALL NOT be offered a change.

#### Scenario: Set from the row menu
- **WHEN** the switch is on and the user opens a row's menu, chooses Energy and Low
- **THEN** the row shows "Low" in its metadata and the change can be undone from the toast

#### Scenario: Empty task gains nothing
- **WHEN** the switch is on and a task has no energy
- **THEN** its row and its facts show no energy, and the Add menu lists Energy

#### Scenario: Viewer of a shared project
- **WHEN** a viewer opens a shared task set to Deep
- **THEN** the Energy row reads Deep without a control, and the row menu offers no Energy submenu

#### Scenario: Keyboard only
- **WHEN** the user tabs to the Energy row on the task page and presses the right arrow and Enter
- **THEN** the next value is chosen without a pointer

### Requirement: Energy through the API, CLI and agent tools
The REST task shape SHALL carry `energy` as `"deep"`, `"medium"`, `"low"` or `null` when none. `POST` and `PATCH /api/v1/tasks` SHALL accept those values (`null` or `""` clears) and SHALL refuse anything else with a 400 error `invalid_energy` and no write; the routes keep their existing authentication and policies, and a viewer's write is refused as for any field. The CLI SHALL accept `--energy deep|medium|low|none` on `ot add` and `ot edit` and show the field in `--json` and as an `ENERGY` column of the list whenever a listed task has one. The agent tools' create and update tools SHALL accept `energy` and the read tools SHALL return it; writes go through the operation log like every agent write. The JSON export SHALL carry the field, and CSV import SHALL map a column named `energy`, ignoring letter case of the values and reporting any other value without setting it.

#### Scenario: Set over REST
- **WHEN** a client with a full token sends `PATCH /api/v1/tasks/<id>` with `{"energy":"low"}`
- **THEN** the task's energy is Low and devices show it after their next sync

#### Scenario: Invalid value over REST
- **WHEN** a client sends `{"energy":"high"}`
- **THEN** the response is 400 with the code `invalid_energy` and the task is unchanged

#### Scenario: Unauthenticated
- **WHEN** a request without a session or token sends `PATCH /api/v1/tasks/<id>` with an energy
- **THEN** it is refused with 401 and nothing is written

#### Scenario: CLI
- **WHEN** the user runs `ot add "Inbox zero" --energy low`
- **THEN** the task is created with energy Low

#### Scenario: Export and CSV import
- **WHEN** the user exports their data and imports the file into another account, and imports a CSV file with an `energy` column
- **THEN** each exported task keeps its energy, each CSV row with `Deep` or `low` gets that energy, and a row whose energy reads `HIGH` is imported without energy and reported
