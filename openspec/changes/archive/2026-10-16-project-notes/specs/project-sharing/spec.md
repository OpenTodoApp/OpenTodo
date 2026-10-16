# Spec Delta

## MODIFIED Requirements

### Requirement: Role permissions
A `viewer` SHALL read the project and its tasks. An `editor` SHALL additionally create, edit, complete and delete tasks in the project, and edit the project's note (`description` and `notes_doc`). An `admin` SHALL additionally rename, recolour and archive the project and manage members other than the owner. Only the `owner` SHALL delete the project, transfer ownership and change or remove admins. Every write SHALL be checked on the server regardless of what the client allowed, and a refused write SHALL leave the server state unchanged on every device.

#### Scenario: Viewer tries to edit
- **WHEN** a viewer's device submits an operation changing a task title in the shared project
- **THEN** the operation is rejected, the title stays as it was on every other member's device, and the viewer's device discards its local change

#### Scenario: Editor renames the project
- **WHEN** an editor submits an operation changing the project name
- **THEN** the operation is rejected and the name is unchanged for every member

#### Scenario: Admin manages members
- **WHEN** an admin changes a viewer to editor and removes another editor
- **THEN** both changes take effect, while the same admin changing the owner's role is refused with a 403 `forbidden` error

#### Scenario: Editor edits the project note
- **WHEN** an editor of a shared project changes its note and syncs
- **THEN** the server stores the note operations and every member sees the new note after their next sync

#### Scenario: Viewer cannot edit the note
- **WHEN** a viewer's device submits a `description` or `notes_doc` operation for the shared project
- **THEN** the server refuses it with reason `forbidden`, the stored note is unchanged, and the viewer's device reverts to the server's value
