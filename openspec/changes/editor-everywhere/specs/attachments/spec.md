## ADDED Requirements

### Requirement: Embedded attachments
An image attachment of a task MAY be embedded in that task's notes or in a comment of the task by reference to its id; the reference carries no bytes and does not change the attachment's quota, permissions or lifecycle. Removing an attachment that a note on this device embeds SHALL ask for confirmation naming the note; after removal, references render as "Removed image". An embed SHALL only ever name an attachment of the same task; a reference to another task's attachment or an unknown id SHALL render as "Removed image" and SHALL load nothing.

#### Scenario: Remove an embedded image
- **WHEN** the user removes an attachment that the task's notes embed
- **THEN** a confirmation names the notes, and after confirming the attachment is removed and the note shows "Removed image" in its place

#### Scenario: Reference to another task's file
- **WHEN** a comment body contains `![x](attachment:<id of a file on another task>)`
- **THEN** the app renders "Removed image" and requests nothing for that id

#### Scenario: Bytes stay where they are
- **WHEN** a 3 MB photo is embedded in a note
- **THEN** the note's document grows by the reference only, the quota is unchanged, and the bytes are still served solely by the attachment content route
