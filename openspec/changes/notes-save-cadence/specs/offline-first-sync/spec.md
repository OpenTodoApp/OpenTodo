## MODIFIED Requirements

### Requirement: Sync triggers and status
The client SHALL sync shortly after each local edit, except that a note document saved while typing is sent after the note's push cadence (`rich-text-editing` "Note push cadence": 3 seconds after the last save, at once when the editor is left, and at least every 60 seconds), when the network comes back, when the tab becomes visible, when the server signals that new operations are available, and periodically while open. Any exchange SHALL carry every pending change, note documents included. It SHALL show whether it is synced, syncing, offline (with the count of pending changes), signed out, or in error, SHALL show whether live updates are connected, and SHALL let the user trigger a sync manually. Offline, every pending change SHALL stay on the device until the next successful exchange, and convergence SHALL not depend on when a change is sent.

#### Scenario: Status while offline
- **WHEN** the device is offline with unsent edits
- **THEN** the indicator shows offline with the number of pending changes

#### Scenario: Remote change arrives promptly
- **WHEN** device A is signed in with live updates connected and device B (or an API client) records an operation for the same user
- **THEN** device A runs a sync exchange within two seconds without user action and shows the change

#### Scenario: Live state visible in the indicator
- **WHEN** the live channel is connected, and later when it is disconnected
- **THEN** the indicator distinguishes the two states, and in the disconnected state syncing still happens on the periodic timer

#### Scenario: Note typing waits for a pause
- **WHEN** the user types in a note with one-second pauses and changes nothing else
- **THEN** no exchange runs for the note until a 3-second pause, the editor leaves focus, or 60 seconds pass, and the indicator shows the change as pending meanwhile
