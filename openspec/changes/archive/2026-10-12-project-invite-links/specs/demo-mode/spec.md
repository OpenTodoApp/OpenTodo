# Spec Delta

## ADDED Requirements

### Requirement: Project invite links refused on the demo
With demo mode on, every request to `/api/v1/projects/{id}/invites` and `/api/v1/project-invites` SHALL be refused with 403 `demo_restricted` before authentication, so sandboxes cannot reach each other's projects. The share dialog SHALL not offer invite links there.

#### Scenario: Create refused
- **WHEN** a demo sandbox posts to a project's invites route
- **THEN** the response is 403 `demo_restricted` and no link exists

#### Scenario: Preview refused
- **WHEN** an anonymous client previews a project link on a demo instance
- **THEN** the response is 403 `demo_restricted`
