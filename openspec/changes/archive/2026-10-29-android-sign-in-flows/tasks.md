## 1. Navigation rule

- [x] 1.1 `SignInFlow.kt`: the main-frame decision (D1) with the 15-minute timeout and `hiddenRunStays`; `SignInFlowTest` (wall chain, single sign-on, links, timeout, leaving, origins) passes in `make android`
- [x] 1.2 `MainActivity` uses it for main-frame navigations, shows the site bar on foreign pages with close and back returning to the server, runs the share script only on the server's origin, flushes cookies on pause and on server pages; `BridgeTest` (including `linksToOtherSitesOpenTheSystemBrowser`) unchanged and passing
- [x] 1.3 `HiddenRun` refuses foreign navigations through `SignInFlow.hiddenRunStays` and opens nothing

## 2. First run

- [x] 2.1 `HealthCheck`: `LOGIN_WALL` and `WEB_PAGE`, the browser-like `Accept`, the cookie header; `HealthCheckTest.loginWalls` and the local-server redirect pass
- [x] 2.2 `SignInActivity` and the "Sign in here" offer in `SetupActivity`; strings in six languages (`checkTranslations`)

## 3. Instrumented tests

- [x] 3.1 `SignInFlowsTest`: a walled server and a provider on another origin; the wall's sign-in, single sign-on, the site bar's close and the first run behind the wall complete without any `ACTION_VIEW` intent and with no bridge on the provider's page (CI Android job, connected tests)

## 4. Docs

- [x] 4.1 `docs/android-app.md` "Behind a login page", the paths a bypass needs, the provider limitation; `docs/self-hosting/docker.md` and `docs/self-hosting/sso.md` point to it; CHANGELOG `### Fixed`
