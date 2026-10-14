# Spec Delta

## ADDED Requirements

### Requirement: Public links refused on the demo
With demo mode on, every request to `/api/v1/projects/{id}/public-links` and `/api/v1/public` SHALL be refused with 403 `demo_restricted` before authentication, so no sandbox content ever reaches an anonymous visitor. The share dialog SHALL not offer public links there.

#### Scenario: Create refused
- **WHEN** a demo sandbox posts to a project's public-links route
- **THEN** the response is 403 `demo_restricted` and no link exists

#### Scenario: Public read refused
- **WHEN** an anonymous client requests `/api/v1/public/<any secret>` on a demo instance
- **THEN** the response is 403 `demo_restricted`
