# Spec Delta

## ADDED Requirements

### Requirement: Events of connected calendars
Calendars a user connected through calendar sync SHALL be stored as managed subscriptions: their events SHALL be served by `GET /api/v1/calendar-feeds/events` and drawn like subscription events, while the subscription routes, limits and fetcher SHALL never list, count, fetch or change them. The events route SHALL answer while calendar feeds or calendar sync is on; with calendar feeds off it SHALL serve only managed subscriptions. Deleting the connection SHALL delete its managed subscriptions and their events.

#### Scenario: Calendar feeds off, calendar sync on
- **WHEN** calendar feeds are off, calendar sync is on and a user shows a connected calendar
- **THEN** `GET /api/v1/calendar-feeds/events` answers with that calendar's events and `GET /api/v1/calendar-feeds/subscriptions` still answers 404

#### Scenario: Not counted
- **WHEN** a user with 10 subscriptions shows two connected calendars
- **THEN** the subscription list still shows 10 and the limit is unchanged

#### Scenario: Unauthenticated
- **WHEN** the events route is requested without credentials
- **THEN** the response is a 401 `unauthorized` error
