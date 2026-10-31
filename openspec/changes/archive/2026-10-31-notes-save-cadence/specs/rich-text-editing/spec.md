## ADDED Requirements

### Requirement: Note push cadence
The note editor (task notes, project notes and every later note that uses it) SHALL save the document and its projection on the device after every pause in typing, as before, and SHALL send a saved document to the server 3 seconds after the last save while no further save happened, at once when the editor loses focus, is closed, or the app navigates away, when the page is hidden or unloaded, and at least every 60 seconds while the person keeps typing without such a pause. A sync exchange that runs for any other reason SHALL carry the pending document too. The device SHALL keep at most one pending document per note, the newest. Offline, saves SHALL stay on the device and SHALL be sent on the next successful exchange; convergence SHALL be unchanged, since every sent document is a full state that includes every earlier save of that device. The comment composer SHALL keep its behaviour: it sends a comment only when the person submits it.

#### Scenario: Typing with short pauses
- **WHEN** the user types in a note for 30 seconds with pauses of about one second
- **THEN** the note survives a reload at any moment, and no note document is sent until the user pauses for 3 seconds

#### Scenario: Pause sends the note
- **WHEN** the user stops typing in a note and does nothing for 3 seconds
- **THEN** one note document with the latest text is sent to the server

#### Scenario: Continuous typing
- **WHEN** the user types without a 3-second pause for two and a half minutes
- **THEN** the note document is sent at least twice during that time, the newest state each time

#### Scenario: Leaving the note
- **WHEN** the user types a sentence and at once closes the task, opens another one, or switches to another app
- **THEN** the document is sent at once, without waiting for the 3 seconds

#### Scenario: Another edit carries the note
- **WHEN** the user types in a note and, within a second, changes the task's due date
- **THEN** the exchange for the due date also carries the note's latest document

#### Scenario: Offline writing
- **WHEN** the device is offline and the user writes in a note for ten minutes, then reconnects
- **THEN** one document with the latest text is sent on the next exchange, and every device shows it after sync

#### Scenario: Comments unchanged
- **WHEN** the user types a comment and waits 3 seconds without sending
- **THEN** nothing is sent to the server and the draft stays on the device

## MODIFIED Requirements

### Requirement: Remote edits while editing
When a merged document arrives while the user is editing the same note, the editor SHALL apply the remote change in place without discarding unsaved typing, without resetting the caret to the start or end, and without flashing the content. With a live update channel connected, a collaborator's change SHALL appear about 3 seconds after the collaborator stops typing (within 5 seconds against a local server), and at least once a minute while the collaborator keeps typing; without a live channel, on the next sync exchange.

#### Scenario: Co-editing one note
- **WHEN** device A is typing in a note and device B inserts text above the caret
- **THEN** device A shows B's text, A's caret stays on the character it was on, and A's in-progress typing is intact

#### Scenario: Collaborator pauses
- **WHEN** device B types a paragraph into a shared task's note and stops, while device A has the same note open with the live channel connected
- **THEN** device A shows the paragraph within 5 seconds of B's last keystroke
