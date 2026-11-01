## ADDED Requirements

### Requirement: System bars follow the app's theme
A shell MAY offer the bridge capability `system-bars`, which lets the web app hand it the bar colour as `#rrggbb` and whether the icons on it must be light. A shell that offers it SHALL colour the phone's status bar (and on Android the navigation bar) with it and choose legible icons, SHALL remember the last colour and apply it at its next launch before the page is drawn, and SHALL ignore a malformed payload. The web app SHALL hand the colour over whenever the bar colour changes, and SHALL NOT call the method on a shell that does not list the capability. The payload SHALL be part of the shared bridge fixtures.

#### Scenario: Theme change on Android
- **WHEN** the user switches the dark side's theme while the Android app is in dark mode
- **THEN** the status and navigation bars take the new theme's bar colour in the same moment the page changes

#### Scenario: Malformed payload
- **WHEN** the shell receives a colour `red` or a payload without `dark`
- **THEN** it keeps its current bars and logs nothing that contains the payload beyond its length

#### Scenario: Fixture changes
- **WHEN** a change renames the `dark` field of the payload
- **THEN** the web fixture test fails until the fixture is regenerated, and then the Android and iOS unit tests fail until the shells read the new field
