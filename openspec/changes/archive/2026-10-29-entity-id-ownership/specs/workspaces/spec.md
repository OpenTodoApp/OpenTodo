## ADDED Requirements

### Requirement: A project joins only its author's workspaces
A project's `workspace_id` operation SHALL be refused with reason `forbidden` unless its value is null, the author's default workspace, or a workspace the author is a member of. When the server decides which workspace a project belongs to (deleting a workspace, a created workspace's directory, group grants and mentions), it SHALL read the project's own record only: the shared project's scope, or the personal copy of an account that belongs to the named workspace. Offline devices converge: a refused move is dropped and the project stays where it was.

#### Scenario: Foreign workspace
- **WHEN** bob submits a `workspace_id` operation that puts his project in alice's workspace, of which he is not a member
- **THEN** the operation is refused with reason `forbidden` and alice can still delete her empty workspace

#### Scenario: Value written by an earlier version
- **WHEN** the database holds such a value from before the upgrade
- **THEN** the project does not count as part of alice's workspace

#### Scenario: Own workspace
- **WHEN** bob moves his project to a workspace he belongs to, or to his default workspace
- **THEN** the move is applied
