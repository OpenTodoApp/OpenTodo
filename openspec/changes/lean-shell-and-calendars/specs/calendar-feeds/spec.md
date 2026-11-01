## ADDED Requirements

### Requirement: No event requests while calendars are off
A device SHALL read the calendar feeds and calendar sync owner switches before it requests `GET /api/v1/calendar-feeds/events` from a cache refresh, a live calendar signal, a reconnect or Today's agenda. While both switches are off the device SHALL make no events request and SHALL resolve the refresh as unsuccessful. It SHALL delete the cached occurrences, subscriptions and cached window in that case, so events from a period when calendars were on are not drawn, and the next refresh after either switch is on SHALL fetch events again. When the switches cannot be read (offline, an older server or a failed settings read), the device SHALL treat the state as unknown and make the events request; a failed events request SHALL keep the existing cache as before.

#### Scenario: Both switches off
- **WHEN** the default install has both calendar feeds and calendar sync off and the app starts or reconnects
- **THEN** no request reaches `/api/v1/calendar-feeds/events`, no 404 `feeds_disabled` is logged, and any cached events and subscriptions are removed from the device

#### Scenario: One switch on
- **WHEN** the owner enables calendar sync while feeds stay off and the device next refreshes or opens Day
- **THEN** the device asks for events and draws them, because the server's events route allows either switch

#### Scenario: Switches unreadable
- **WHEN** the device is offline or the server answers the switch read with an error
- **THEN** the device still attempts the events request when it has a window, and keeps its cached events if that request fails

#### Scenario: Turning calendars off
- **WHEN** the owner turns the last calendar switch off and a signed-in device refreshes
- **THEN** the cached events and subscriptions are cleared and the agenda and grid show no calendar events until a switch is on again
