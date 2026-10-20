# Spec Delta

## ADDED Requirements

### Requirement: Issue connections refused on the demo
With demo mode on, every request to `/api/v1/issues` and `/api/v1/settings/issues` SHALL be refused with 403 `demo_restricted` before authentication, so the demo server never contacts a visitor's host with a visitor's token. The Issues panel SHALL be replaced by the demo note there.

#### Scenario: Connection refused
- **WHEN** a demo sandbox posts an issue connection
- **THEN** the response is 403 `demo_restricted`, nothing is stored and no outbound request is made

#### Scenario: Owner switch refused
- **WHEN** any client calls `PUT /api/v1/settings/issues` on a demo instance
- **THEN** the response is 403 `demo_restricted`

#### Scenario: Panel on the demo
- **WHEN** a sandbox opens `/settings/integrations`
- **THEN** the Issues panel is shown under the demo note with disabled controls
