## ADDED Requirements

### Requirement: CI tests the built app offline
CI SHALL run the tests of the built web app (the precache and deny list of the service worker, the web app manifest, and the absence of workbench code in the build) after the build, and a missing build SHALL fail them rather than skip them. CI SHALL also start the built server on a fresh data directory and check in a browser that, once the service worker controls the page, a reload with the network off opens the app with the tasks stored on the device, that a request to `/api/*` is never answered from a cache, and that a task added offline reaches the server after the network returns.

#### Scenario: The service worker caches the API
- **WHEN** a change lets the service worker answer `/api/v1/tasks` from a cache
- **THEN** the offline start check fails naming the API request

#### Scenario: The app does not open offline
- **WHEN** a change drops the app's start page from the precache
- **THEN** the reload with the network off shows no app and the offline start check fails

#### Scenario: The build is missing
- **WHEN** the built-app tests run in CI without `internal/web/dist`
- **THEN** they fail instead of being skipped
