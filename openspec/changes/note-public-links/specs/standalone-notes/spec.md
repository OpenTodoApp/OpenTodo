## MODIFIED Requirements

### Requirement: Notes follow their project
A note with a project SHALL live in that project's sharing scope and a note without a project in the author's personal scope and workspace. A note SHALL be shared with people only by being in a shared project: owners, admins and editors of the project may write it, viewers may read it, others SHALL neither see nor write it. The one other way a note leaves its scope SHALL be a read-only note page (`note-pages`), which shows it to anyone with its link and gives no access to anything else. Sharing a project SHALL share its notes; deleting a shared project SHALL move them to the Trash and copy the owner's notes into the owner's personal scope without a project. A change of project that would move a note into another scope SHALL be refused by the server as a scope change; the client SHALL move such a note by copying it and deleting the original. Offline, a move is a local batch like any edit; refusals are reported and the device shows the server's value, so all devices converge.

#### Scenario: Share a project with notes
- **WHEN** the owner shares the project "Renovation" holding two notes with Anna as an editor
- **THEN** Anna's devices receive both notes, and her edit to one reaches the owner's devices

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens one of its notes
- **THEN** the note is read-only, and an operation from the viewer for it is refused as forbidden

#### Scenario: Move to a shared project
- **WHEN** the user moves a personal note into a project shared with others
- **THEN** a copy appears in the shared project with the same title and body, the personal note is removed, and the members see the copy

#### Scenario: One note cannot be shared alone
- **WHEN** the user looks for a way to give another account access to a single note
- **THEN** there is none; the note's project decides who sees and edits it, and "Publish note page…" offers only a read-only link
