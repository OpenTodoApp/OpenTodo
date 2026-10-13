# Spec Delta

## ADDED Requirements

### Requirement: Project invite link events
The server SHALL record `project_invite.created`, `project_invite.revoked` and `project_invite.accepted` with the acting account, the link id, the project id, the role and the bound email, in the transaction of the change. The secret and the project name SHALL never be recorded.

#### Scenario: Link accepted
- **WHEN** Bob joins a project through a link Alice created
- **THEN** the log contains `project_invite.accepted` with Bob as actor and the link id, project id and role in its details

#### Scenario: Link created
- **WHEN** Alice creates a project link
- **THEN** the log contains `project_invite.created` with Alice as actor and no secret or link in its details
