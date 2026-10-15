# Spec Delta

## ADDED Requirements

### Requirement: Calendar feeds refused on the demo
With demo mode on, every request to `/api/v1/calendar-feeds` and `/feeds` SHALL be refused with 403 `demo_restricted` before authentication, so the demo server never fetches a visitor's URL and serves no feed. The Calendar feeds panel SHALL be replaced by a note there.

#### Scenario: Subscription refused
- **WHEN** a demo sandbox posts a calendar subscription
- **THEN** the response is 403 `demo_restricted`, nothing is stored and no outbound request is made

#### Scenario: Feed refused
- **WHEN** any client requests `/feeds/<secret>/tasks.ics` on a demo instance
- **THEN** the response is 403 `demo_restricted`

#### Scenario: Events route refused
- **WHEN** a sandbox reads `/api/v1/calendar-feeds/events`
- **THEN** the response is 403 `demo_restricted` and the Day view shows no calendar toggle
