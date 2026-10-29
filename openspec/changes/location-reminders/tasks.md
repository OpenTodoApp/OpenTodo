# Tasks

## 1. Data model and server

- [ ] 1.1 Extend `kReminderKind` with `arrive` and `leave`. Add `reminder.radius_m` (new kind `kRadius`, 100–5,000, nullable) to `Schema` in `internal/sync/ops.go`, and refuse `fire_at` and `offset_minutes` on location kinds and `radius_m` on other kinds. Regenerate the web schema with `UPDATE_OP_SCHEMA=1`. Verify: `go test ./internal/sync/...`, with validation tests for every refused combination.
- [ ] 1.2 Scheduler: confirm with a test that location reminders are never pushed, never dismissed by the server and never counted in the bounded pages. Verify: `go test ./internal/push/...`.
- [ ] 1.3 REST: the kinds and `radius_m` on `POST`/`PATCH /api/v1/reminders`, and 400 `invalid_operation` cases. Verify: `internal/httpapi` tests for create, update, 401 without credentials, a `read` token refused, a viewer refused on a shared task, and out-of-range values.
- [ ] 1.4 CalDAV: skip location reminders when serving, exempt them from the absent-alarm deletion, and keep `PROXIMITY` alarms as client data. Verify: `internal/httpapi` CalDAV tests with an Apple proximity alarm fixture, and a round trip that keeps both reminders.
- [ ] 1.5 `ot task show` lists location reminders. Verify: `go test ./internal/cli/...`.

## 2. Web app

- [ ] 2.1 `web/src/lib/geofences.ts`: the armed set (D2), the payload builder (at most 100, sorted by id, titles per the include-titles rule and never for encrypted accounts), the reset on sign-out, lock and server change, and the call to `scheduleGeofences` only when the shell lists `geofences`. Verify: `geofences.test.ts` (armed rules, linked place resolution, encrypted lock clears, older shell never called).
- [ ] 2.2 Extend the shared bridge fixtures (`web/src/lib/shellBridge.fixture.*`) with the geofence payload and the Done and Dismiss notification addresses, and have the web app read those addresses. Verify: `shellBridge.fixture.test.ts`.
- [ ] 2.3 Task panel: "When I arrive" and "When I leave" in the reminder menu, the radius form with presets, disabled state with the link to the location editor, chip text, and "Fires on your phone" where it can't fire. Verify: an interaction test (happy-dom), and a story in both themes and at phone width.
- [ ] 2.4 Settings → Notifications: "Location reminders on this phone" (only with the capability), the disclosure sheet, the permission states including `foreground-only` with Open settings, and the browser explanation line. Verify: a settings test with a fake shell for each answer.
- [ ] 2.5 Strings in `messages.json` and the five catalogs. Verify: `node scripts/i18n-check.mjs`.
- [ ] 2.6 `npm test`, `npm run build` and `make ui-lint` pass.

## 3. Android shell

- [ ] 3.1 The `geofences` capability: parse the payload, rank by distance and register up to 19 proximity alerts plus the re-rank region with `LocationManager`, keep the 60-minute cooldown per reminder, notify with Done and Dismiss through the fixture addresses, and clear on reset. Keep the position only in memory and as the ranking anchor in private storage. Verify: unit tests against the shared fixtures, and a ranking test with 40 regions in two cities, in `make android`.
- [ ] 3.2 Two-step permission request (fine, then background) and the `foreground-only` answer. Manifest entries for `ACCESS_FINE_LOCATION` and `ACCESS_BACKGROUND_LOCATION`. Verify: `make android` lint, and a manual run on an Android 14 device recorded in the PR.

## 4. iOS shell (after `ios-shell` ships)

- [ ] 4.1 The same capability with Core Location region monitoring (19 regions plus the re-rank region), `NSLocationAlwaysAndWhenInUseUsageDescription`, When In Use then Always. Verify: the iOS unit tests against the shared fixtures, and a manual device run recorded in the PR.

## 5. Documentation and release

- [ ] 5.1 A "Location reminders" section in `docs/task-reminders.md`, plus pointers in `docs/locations-and-places.md`, `docs/android-app.md` and `docs/ios-app.md` (permission, privacy, the 19-region limit, encrypted accounts). Add the kinds and `radius_m` in `docs/api.md`, and the CalDAV behaviour in `docs/caldav.md`. Verify: `make docs-check`.
- [ ] 5.2 The Play background-location declaration text and the disclosure screenshot, handed to `play-production`. Verify: the file under `mobile/android` store metadata is reviewed in the PR.
- [ ] 5.3 CHANGELOG entry under Unreleased (Added).
- [ ] 5.4 `make check` (TZ=UTC) passes.
