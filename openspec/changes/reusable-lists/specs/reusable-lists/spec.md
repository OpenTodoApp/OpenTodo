## ADDED Requirements

### Requirement: Reusable list mode
A project SHALL be markable as a reusable list through its synced `reusable` field, from a "Reusable list" switch in the project's Edit dialog, off by default. Editors, admins and the owner of a shared project SHALL be able to change it; viewers SHALL see the mode and SHALL NOT change it. The mode SHALL be written as an ordinary project operation, applied locally first so it works offline, and SHALL converge by last-writer-wins on every member's devices. Turning it off SHALL write nothing to the project's tasks.

#### Scenario: Turn on offline
- **WHEN** the owner of "Groceries" turns on Reusable list while offline
- **THEN** the list switches to the reusable presentation at once, and every member's devices show it after the owner's device and theirs sync

#### Scenario: Concurrent changes
- **WHEN** one member turns the mode on and another, offline, renames the project, and both sync
- **THEN** every device shows the renamed project in reusable mode

#### Scenario: Viewer
- **WHEN** a viewer opens the Edit dialog of a reusable shared project
- **THEN** the switch is shown on and disabled, and no operation can be queued

### Requirement: Adding an existing item reopens it
In a reusable list, adding a task from quick add whose title normalizes equal to that of a live top-level task of the project SHALL NOT create a task. Normalization SHALL ignore case, accents, surrounding white space, repeated white space and one trailing full stop, and SHALL be identical in the web client and the server, pinned by shared test vectors. A completed match SHALL be reopened in place, keeping its section, notes and labels, with the add's parsed tokens applied to it; an open match SHALL be left unchanged and scrolled into view. A toast SHALL say which happened and offer Add anyway, which creates the task as an ordinary add. Matching SHALL run on the device's local data, so it works offline. Undo SHALL restore the previous completion.

#### Scenario: Milk comes back
- **WHEN** "Milk" is ticked off in the Dairy section of a reusable list and the user adds "milk " from quick add
- **THEN** the ticked Milk is reopened in Dairy, no new task exists, and the toast reads "Milk is back on the list"

#### Scenario: Already on the list
- **WHEN** "Bread" is open and the user adds "Bread"
- **THEN** nothing is written, the Bread row flashes once, and the toast reads "Bread is already on the list"

#### Scenario: Add anyway
- **WHEN** the user chooses Add anyway on that toast
- **THEN** a second, new Bread task is created as an ordinary add

#### Scenario: Accents and case
- **WHEN** "Café" is ticked off and the user adds "CAFE"
- **THEN** Café is reopened

#### Scenario: Subtasks never match
- **WHEN** the project has a subtask "Milk" under "Breakfast" and the user adds "Milk"
- **THEN** a new top-level task is created

#### Scenario: Same vectors on both sides
- **WHEN** the shared normalization vectors are evaluated by the web client and by the server
- **THEN** both produce the same normalized title and the same chosen match for every vector

### Requirement: Ticked items stay in a reusable list
A reusable list SHALL end with a completed group headed "Got it" and its count on every device, whatever the device's "Show completed tasks" preference, most recently completed first, closed by default with its open state remembered per device. Unticking an item in the group SHALL reopen it. The Project menu SHALL NOT offer "Show completed tasks" in a reusable list, and the line "n completed tasks hidden" SHALL NOT appear there.

#### Scenario: Partner's phone
- **WHEN** Alice ticks off Eggs in the shared reusable "Groceries" and Bob, who never changed any display preference, opens it after sync
- **THEN** Bob's list ends with "Got it 1" holding Eggs

### Requirement: Duplicate items converge
When a device that may edit a reusable list holds two or more live, open, top-level tasks of that project whose titles normalize equal, and none of them has notes, subtasks, comments, attachments, reminders, time entries or a recurrence rule, the device SHALL tombstone all of them except the one with the smallest id, as ordinary deletions shown in the activity log as a merged duplicate and restorable from the Trash. Because every device chooses the same survivor, devices SHALL converge on one item without coordination. A task that carries any of those things SHALL never be tombstoned this way. Viewers' devices SHALL NOT perform it.

#### Scenario: Two phones add eggs offline
- **WHEN** Alice and Bob both add "Eggs" to the shared reusable list while offline, and both sync
- **THEN** after their next sync both devices show one Eggs, the other one is in the Trash, and the history records a merged duplicate

#### Scenario: Duplicate with a note
- **WHEN** one of two open "Eggs" items has the note "free range"
- **THEN** both stay on the list

### Requirement: Aisle sections
While a reusable list has "Sort into aisles" on, the user SHALL be offered to add the nine standard aisle sections (produce, bakery, dairy and eggs, meat and fish, frozen, pantry, drinks, household, personal care), named in the app's language and each carrying its fixed aisle key. A new item added from quick add without a section token SHALL be placed in the first live section of the project whose aisle key matches a word or two-word sequence of its title in the bundled vocabulary of the app's language, falling back to English. Without a matching section or word it SHALL go where quick add places it today. A reopened item SHALL NOT be moved. The vocabulary SHALL be bundled and evaluated on the device, with no network request.

#### Scenario: Yoghurt to Dairy
- **WHEN** a reusable list with aisle sections and an app in English receives the new item "Greek yoghurt"
- **THEN** the item is created in the section keyed `dairy`, even if it was renamed "Fridge"

#### Scenario: Other language, same list
- **WHEN** a member using the app in Italian adds "latte" to the same list
- **THEN** the item lands in the section keyed `dairy`, whatever its name

#### Scenario: Learned placement
- **WHEN** the user moves "Oat drink" from Drinks to Dairy, ticks it off and later adds "Oat drink" again
- **THEN** it is reopened in Dairy

#### Scenario: Unknown word
- **WHEN** the user adds "Birthday candles" and no vocabulary entry matches
- **THEN** the item is created in the current section or in "No section"

### Requirement: Reusing items through the API
`POST /api/v1/tasks` SHALL accept an optional boolean `reuse`. With `reuse: true` and a reusable target project, the server SHALL apply the same matching inside the creating transaction: a completed match SHALL be reopened through the op log and returned with status 200 and `"reused": "reopened"`, an open match SHALL be returned with status 200 and `"reused": "open"` without a write, and no match SHALL create the task with status 201. For an account with end-to-end encryption, or a ciphertext title, the server SHALL create the task with status 201 and `"reused": "unavailable"`. Without `reuse`, the route SHALL behave as before. The command-line client's `ot add` and the MCP task creation tool SHALL request reuse when the target project is reusable.

#### Scenario: Reopen through the API
- **WHEN** a client with a full token posts `{"title": "Milk", "project_id": "<groceries>", "reuse": true}` while Milk is ticked off there
- **THEN** the response is 200 with Milk and `"reused": "reopened"`, and every member's devices show Milk open after sync

#### Scenario: Unauthenticated
- **WHEN** the same request arrives without credentials
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Viewer
- **WHEN** a viewer of the shared list posts the same request
- **THEN** the response is 403 `forbidden` and Milk stays ticked off

#### Scenario: Encrypted account
- **WHEN** an account with end-to-end encryption posts a ciphertext title with `reuse: true`
- **THEN** a new task is created with status 201 and `"reused": "unavailable"`, and a device that later sees two qualifying duplicates collapses them
