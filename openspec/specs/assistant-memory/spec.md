# assistant-memory Specification

## Purpose
The in-app assistant remembers short facts the user states, such as working days or planning preferences. They are confirmed by the user, synced like settings, encrypted with end-to-end encryption, and sent with each turn. They never go to MCP clients or routines.

## Requirements

### Requirement: Memory items
A memory item SHALL be a short text (at most 200 characters) the user owns, stored as a synced entity through the op log with a personal scope, and its text a content field. Items SHALL be created, edited and deleted locally first, work offline, sync later, and converge by last writer per field; deletion is a tombstone. A user has at most 20 live items.

#### Scenario: Added offline, synced later
- **WHEN** the user adds "I work Monday to Thursday" while offline and later reconnects
- **THEN** the item syncs, appears on their other devices, and an encrypted account stores its text encrypted

#### Scenario: The 21st item
- **WHEN** the user already has 20 items and adds another
- **THEN** the item is refused locally with a message to remove one first

### Requirement: Proposing a memory
The in-app assistant SHALL be offered the tool `remember`, with one text of at most 200 characters, on the server and the device. It SHALL never write: it adds a memory item to the turn's proposed change set, reviewed, applied and undone like the other items. The fixed instructions SHALL tell the model to propose only facts the user stated about themselves.

#### Scenario: Remember a working week
- **WHEN** the user says "I don't work on Fridays" and the model calls `remember` with "Does not work on Fridays"
- **THEN** the proposal shows "Remember: Does not work on Fridays" with a checkbox, and only applying it creates the item

### Requirement: Memory in turns
Every assistant turn, on the server and on the device, SHALL include the user's live memory items in the fixed instructions as the user's own stated preferences, in their order. Content written by other people stays untrusted as before.

#### Scenario: Planning respects memory
- **WHEN** the user has the item "Does not work on Fridays" and runs Plan my week
- **THEN** the instructions sent with the turn contain that item

### Requirement: Managing memory
Settings SHALL list the user's memory items under the assistant, where each can be edited, reordered or deleted, and new ones added. Changes apply locally and sync like any edit.

#### Scenario: Delete an item
- **WHEN** the user deletes "Anna is my manager" in Settings
- **THEN** the item is gone on every device after sync and no later turn includes it

### Requirement: Memory stays in the app
Memory items SHALL never be offered to MCP clients, agent tokens, routines' AI steps, or other people. They SHALL be in the user's own export.

#### Scenario: Not over MCP
- **WHEN** an MCP client with a read token lists tools and resources
- **THEN** nothing returns memory items

### Requirement: Consent names memory
The assistant disclosure SHALL say that memory items are sent with every turn to the chosen provider (version 5). A user who consented to an earlier version SHALL be told once, without being asked to consent again.

#### Scenario: Told once
- **WHEN** a user who accepted disclosure version 4 opens the assistant after this change
- **THEN** a one-time notice says memory items are sent with each turn, and the assistant keeps working
