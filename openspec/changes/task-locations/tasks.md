## 1. Data model and sync

- [ ] 1.1 Add the task `location` field (whole-value register) and the `place` entity to `internal/sync/ops.go` `Schema`, with validation of the location shape, ranges, lengths and the ciphertext alternative; verify with table tests in `go test ./internal/sync/...` covering every scenario of "Location validation"
- [ ] 1.2 Add an additive migration (`internal/store/migrations/NNNN_task_location_places.sql`) for the column and the `places` table, with materialized reads and tombstones; verify with `go test ./internal/store/... ./internal/sync/...` (migration applies on a copy of an existing database, old rows read `location: null`)
- [ ] 1.3 Add `location` and `Place` to `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`, a Dexie table for places, and `mutate()` helpers; verify with vitest for create, offline edit, concurrent whole-value convergence and the linked-place display rule (`npm test`)
- [ ] 1.4 Add `location` (whole value) and place `name`, `address`, `lat`, `lon` to `internal/e2ee.ContentFields` and `CONTENT_FIELDS` in `web/src/lib/e2ee.ts`; verify with the existing E2EE round-trip tests extended to the four scenarios of "Encrypted locations and places" (`go test ./internal/e2ee/...`, `npm test`)
- [ ] 1.5 Include places and task locations in the export and the own-format import, links restored; verify with the export round-trip test (`go test ./internal/importer/...`) and `docs/import-export.md` updated

## 2. Map proxy and switches (server)

- [ ] 2.1 Owner settings `maps.enabled`, `maps.tiles_url`, `maps.geocoder_url` with `OPENTODO_MAPS`, `OPENTODO_MAPS_TILES_URL`, `OPENTODO_MAPS_GEOCODER_URL` overrides validated at startup and demo default off; verify with `go test ./internal/config/... ./internal/settings/...` (invalid `OPENTODO_MAPS=sometimes` exits naming the variable)
- [ ] 2.2 Map proxy routes (style with rewritten URLs, tiles, fonts, sprites, search, reverse) registered with `signedIn` and `.demoDenied()` plus the `internal/httpapi/demo.go` entry, upstream User-Agent, no forwarded client headers, timeouts, `maps_disabled`, `maps_unavailable` and per-user `rate_limited`; verify with httptest-backed tests for every "Map proxy" scenario including the 401 and that `policy_test.go` and the demo deny-list test pass (`go test ./internal/httpapi/...`)
- [ ] 2.3 On-disk tile cache under `<data>/cache/maps` with an LRU size cap, honouring upstream cache lifetimes, excluded from backups; verify with a cache test (hit, eviction at the cap, served while upstream is down) and the backup test asserting the folder is not archived
- [ ] 2.4 Change `Permissions-Policy` to `camera=(), geolocation=(self)`; verify with the security headers test (`go test ./internal/httpapi/...`)
- [ ] 2.5 Expose maps availability in the profile and add the `user_prefs.maps` preference (additive, synced) on server and client; verify with `go test ./internal/sync/...` and a vitest that a device with maps off makes no request to `/api/v1/maps/*`

## 3. Task location in the panel

- [ ] 3.1 Location part on the Where line and its `FacetEditor`: search as you type, coordinates, current position, saved places, "Save as a place", Clear, the provider line under the search field, offline messages; verify with happy-dom tests for "Setting a location" (search pick, permission refused, offline coordinates) (`npm test`)
- [ ] 3.2 Lazily loaded map component (dynamic import of MapLibre GL, worker served from the app origin, style from `/api/v1/maps/style`, attribution shown, no-WebGL fallback); verify the main bundle size is unchanged and the map chunk is separate in `npm run build` output, and a story renders with a stubbed style
- [ ] 3.3 Small map with pin under the facet lines and "Open in maps" (`geo:` on phones, openstreetmap.org on computers); verify with a happy-dom test for the link per platform and the Storybook story in light and dark (`make ui-check`)
- [ ] 3.4 Register "Set location" and "Go to Places" as palette commands in `web/src/lib/shortcuts.ts` without keys; verify the registry conflict test passes (`npm test`)

## 4. Places

- [ ] 4.1 Places page at its own route: ordered list with address and open-task count, reorder, rename, delete, map of all places when maps are on; verify with happy-dom tests and stories (`npm test`, `make ui-check`)
- [ ] 4.2 A place's task list using the standard list view; verify with a test that tasks linked to "Office" are listed and can be completed
- [ ] 4.3 Places entry in the sidebar's More group in every "How you work" mode, never primary unless promoted; verify with `sidebar.test.tsx` and the layout check (`make layout-check`)
- [ ] 4.4 Locked E2EE device shows "Encrypted" places with no pins and makes no map request; verify with an e2ee vitest
- [ ] 4.5 Translations for every new string in the five catalogs; verify `node scripts/i18n-check.mjs`
- [ ] 4.6 Measure and record the lazy map chunk size and the binary growth in this design's D5; verify by comparing `npm run build` output and `ls -l bin/opentodo` before and after

## 5. Settings

- [ ] 5.1 Settings → Server → Maps card (on/off, providers, read-only when set by variables, a line naming what is sent); verify with a happy-dom test and the settings stories
- [ ] 5.2 Settings → General → Maps switch for the user; verify a vitest that turning it off hides maps and search on the device and syncs the preference

## 6. Principle and documentation

- [ ] 6.1 Reword AGENTS.md non-negotiable #5 with the text in design D9, the `openspec/config.yaml` context line, and ROADMAP.md "Principles that do not change"; verify by review in the pull request and `make openspec-validate`
- [ ] 6.2 User guide page `docs/locations-and-places.md` (setting a location, places, maps off, privacy) with front matter and screenshots; verify `make docs` and `make docs-check`
- [ ] 6.3 Self-hosting page `docs/self-hosting/maps.md` (providers, what is sent, cache, turning off, self-hosted Photon and tiles) and the variables in the configuration reference; verify `make docs-check`
- [ ] 6.4 CHANGELOG entry under Unreleased with an upgrade note on default-on maps and `OPENTODO_MAPS=off`; verify by review

## 7. Verification

- [ ] 7.1 Network audit: with maps off, every browser and server request goes to the server's origin or configured destinations; with maps on, the only extra server requests go to the providers; verify with an end-to-end script run against a fresh server (`make e2e` gains the case)
- [ ] 7.2 Layout check covers the location editor and the Places page at 360, 390 and 768 px in Chromium and WebKit; verify `make layout-check`
- [ ] 7.3 Run `make check`; verify it passes
- [ ] 7.4 After `quiet-sidebar` and `sidebar-favourites` are archived, add Places to the More list of app-shell "Sidebar structure"; verify `make openspec-validate`
