## ADDED Requirements

### Requirement: Screens off the start path load on demand
The shell SHALL keep the Inbox, Today, Upcoming and a project's list on its first screen, and SHALL load the Calendar (Day and Week), Settings, Import and a project's Calendar layout from their own chunks when their route or layout is first shown. Those screens' components and their static imports SHALL NOT be part of the entry chunk or the first load's static imports. While a chunk is fetched the content column SHALL show the shared row skeleton as one accessible status, with the sidebar, page bar and keyboard shortcuts still usable. No screen SHALL require a chunk preloaded while the app is idle, on speculation, or by an earlier visit to a different screen.

The service worker SHALL precache every emitted chunk, so a route whose chunk was precached opens offline with its local data after the first visit. A chunk that is missing after an upgrade SHALL leave the shell usable without losing the route's address.

#### Scenario: First visit to the calendar
- **WHEN** a user whose start screen is the Inbox opens Day or Week for the first time
- **THEN** the Inbox was drawn without downloading the Calendar chunk, the content column shows the row skeleton while that chunk loads, and the Day or Week grid then renders with the same address and keyboard shortcuts

#### Scenario: First visit to settings and import
- **WHEN** the user opens Settings from the sidebar and then Import from Settings on a device that has visited neither
- **THEN** each screen's chunk is fetched on that visit and each screen renders without a full page reload or a spinner

#### Scenario: Offline after one visit
- **WHEN** the device is offline and the user reopens Day, Settings or Import after having opened it once
- **THEN** the screen renders from the service worker's precache with the device's local data, and no request is needed to fetch its chunk

#### Scenario: Project Calendar layout
- **WHEN** a project is opened on a device that has never shown the project's Calendar layout, and the user switches that project to Calendar
- **THEN** the Calendar layout and its CalendarView chunk load then, and the project's list did not carry them on the first visit
