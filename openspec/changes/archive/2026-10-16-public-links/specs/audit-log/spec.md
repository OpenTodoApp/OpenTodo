# Spec Delta

## ADDED Requirements

### Requirement: Public link events
The server SHALL record `public_link.created` and `public_link.revoked` with the acting account, the link id, the project id and the link's rights, in the transaction of the change. The secret, the link's name and the project name SHALL never be recorded. Ticks through a link are task edits and SHALL NOT be recorded, like every other task edit.

#### Scenario: Link created
- **WHEN** Alice creates a tick link for a project
- **THEN** the log contains `public_link.created` with Alice as actor and `public_link_id`, `shared_project_id` and `link_rights: tick` in its details, and no secret, name or link

#### Scenario: Link revoked
- **WHEN** an admin revokes that link
- **THEN** the log contains `public_link.revoked` with the admin as actor and the link id and project id in its details

#### Scenario: Tick is not an event
- **WHEN** a guest completes ten tasks through the link
- **THEN** no audit event is recorded for them
