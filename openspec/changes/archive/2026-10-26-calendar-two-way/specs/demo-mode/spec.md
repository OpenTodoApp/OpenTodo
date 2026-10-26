# Spec Delta

## ADDED Requirements

### Requirement: Calendar sync refused on the demo
With demo mode on, every request to `/api/v1/calendar-sync` and `/api/v1/settings/calendar-sync` SHALL be refused with 403 `demo_restricted` before authentication, so the demo server never contacts a visitor's calendar server or Google. The Calendar sync panel SHALL be shown under the demo note with its controls off.

#### Scenario: Connection refused
- **WHEN** a demo sandbox posts a calendar connection
- **THEN** the response is 403 `demo_restricted`, nothing is stored and no outbound request is made

#### Scenario: Owner switch refused
- **WHEN** any client calls `PUT /api/v1/settings/calendar-sync` on a demo instance
- **THEN** the response is 403 `demo_restricted`
