## ADDED Requirements

### Requirement: Location reminders watched on the device
A shell MAY implement the bridge capability `geofences`, whose method `scheduleGeofences` the web app SHALL call with every armed location reminder (at most 100: the reminder id, task id, latitude, longitude, radius, direction, and the title only when the device's "include task titles" option is on and the account is not encrypted) whenever that set changes and during the hourly background refresh. The shell SHALL register at most 19 of them with the platform's own region monitoring, chosen by distance to its last known position and re-chosen when the phone moves far, without any library beyond the platform. On a crossing it SHALL show the notification described in `reminders` "Location reminders", and SHALL answer whether background location is granted (`granted`, `foreground-only`, `denied`, `unavailable`). Settings → Notifications SHALL show "Location reminders on this phone" only where the capability exists, off by default; turning it on SHALL show a disclosure that the position stays on the phone before the platform permission is requested, and with only foreground permission SHALL explain how to allow background location and arm nothing. The position SHALL never be passed to the web view, the server or any other party, nor logged. The regions and the handed-over titles SHALL be stored only in the app's private storage and deleted on sign-out, on lock of an encrypted account and when the server is changed. The payload and the notification addresses SHALL be part of the shared bridge fixtures, and the bridge version SHALL stay 1.

#### Scenario: Turn on in the Android app
- **WHEN** the user turns on "Location reminders on this phone", reads the disclosure, and allows location all the time
- **THEN** the setting reads on, the armed location reminders are registered, and no position data appears in any request

#### Scenario: Only while using the app
- **WHEN** the user allows location only while the app is in use
- **THEN** the setting stays off with "Choose Allow all the time" and an Open settings button, and nothing is registered

#### Scenario: Older shell
- **WHEN** a shell without `geofences` runs a web app that knows it
- **THEN** `scheduleGeofences` is never called, the setting is not shown, and location reminders show "Fires on your phone"

#### Scenario: More places than regions
- **WHEN** the user has 40 armed location reminders spread over two cities
- **THEN** the 19 nearest to the phone are registered, and after travelling to the other city the nearest ones there are registered instead

#### Scenario: Fixture change
- **WHEN** a change renames a field of the geofence payload
- **THEN** the web fixture test fails until the fixtures are regenerated, and the shells' unit tests then fail until they read the new field
