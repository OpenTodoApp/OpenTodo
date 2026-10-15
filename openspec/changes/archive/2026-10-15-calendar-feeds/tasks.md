# Tasks

## 1. Outbound guard shared with webhooks (design D2)

- [x] 1.1 Move `internal/webhook/ssrf.go` and `ssrf_test.go` to `internal/outbound` with `NewClient(d *Dialer, timeout time.Duration, opts ...)` taking the redirect policy; keep `webhook.ValidateURL`, `IsDenied`, `Dialer`, `NewClient`, `ErrPrivateTarget`, `ErrBadURL` as aliases. Verify `go test ./internal/outbound/... ./internal/webhook/... ./internal/httpapi/...` passes unchanged and `TestSignatureMatchesReferenceVector` still runs.
- [x] 1.2 Add the redirect policy test: three hops followed with `ValidateURL` on each, a fourth refused (`too_many_redirects`), a hop to `169.254.169.254` failing with `private_target` before any dial (fake resolver and dialer). Verify `go test ./internal/outbound/...`.

## 2. Parsing, zones and expansion (design D3)

- [x] 2.1 `internal/calfeed/vevent.go`: `ParseCalendar` over `caldav.Parse` with configurable limits (export a `ParseWithLimits` from `internal/caldav/ical.go`, defaults unchanged), reading `VEVENT`s, `X-WR-CALNAME`, `X-WR-TIMEZONE`, `REFRESH-INTERVAL` and `X-PUBLISHED-TTL`. Verify with table tests on fixtures exported from Google Calendar, Outlook, iCloud and Nextcloud in `internal/calfeed/testdata/` (`go test ./internal/calfeed/...`), including an HTML body answering `ErrInvalid`.
- [x] 2.2 `internal/calfeed/zones.go`: IANA and vendor-path resolution plus the CLDR Windows-to-IANA table (generated file with the CLDR version in its header). Verify tests for `W. Europe Standard Time` → `Europe/Berlin`, `Pacific Standard Time` → `America/Los_Angeles`, `/mozilla.org/.../Europe/Berlin`, and an unknown name reporting `ok=false`.
- [x] 2.3 `internal/calfeed/expand.go`: expansion with the spec's supported parts, `RDATE`, `EXDATE`, `RECURRENCE-ID` overrides, cancelled events dropped, window clipping, the 5,000 cap, warnings for unsupported parts and zone fallbacks. Verify table tests for the spec scenarios (weekly with `EXDATE` and a moved instance, `BYDAY=-1FR`, `BYSETPOS`, `WKST`, `UNTIL` across DST, `COUNT`, `BYHOUR` → first occurrence plus warning, truncation at 5,000), each run in two zones.

## 3. Store, fetcher and worker (design D3, D4)

- [x] 3.1 Migration `NNNN_calendar_feeds.sql` (the next free number) with the three tables and indices from D4. Verify `go test ./internal/store/...` applies it on a fresh and an existing database.
- [x] 3.2 `internal/calfeed/store.go`: subscriptions CRUD with the per-user limit, `Replace`, `Events(userID, from, to)` with the padded range query and exact overlap in Go, feed token create/rotate/revoke/lookup, `Due`, `Backoff`. Verify tests: an eleventh subscription errors, `Replace` leaves no rows of the old content, a floating 23:00 event is returned for the right days, a foreign id is not found.
- [x] 3.3 `internal/calfeed/fetch.go`: conditional requests, `webcal` → `https`, body cap, outcome reasons. Verify tests against `httptest` servers: 304 keeps rows, 2 MB + 1 → `too_large`, 500 → `http_500`, timeout → `timeout`, name adopted from `X-WR-CALNAME` when the subscription has none, `X-PUBLISHED-TTL:PT1H` sets `refresh_seconds`.
- [x] 3.4 `internal/calfeed/worker.go`: 30 s poll under the jobs leader, two in flight, backoff doubling to 6 h, stop on `private_target`, `NotifyCalendar` when content changed; wired in `cmd/opentodo/main.go` next to `hooks.Run` and skipped on the demo and while the owner switch is off. Verify worker tests with a fake clock (a failing source is retried at 30 min, 1 h, … 6 h; a success resets; a stopped subscription is never picked), and `go test ./...`.
- [x] 3.5 `internal/sync/notifier.go` and `internal/httpapi/events.go`: a `calendar` signal written as `event: calendar`. Verify an events-stream test receives it and that the existing `ops` tests pass.

## 4. Routes, switch, feed and demo (design D5, D6, D7)

- [x] 4.1 `internal/config`: optional `OPENTODO_CALENDAR_FEEDS` (true/false, invalid value stops startup naming the variable); `internal/httpapi/calfeed.go`: `calendar_feeds.enabled` seeded with `INSERT OR IGNORE`, cached, `GET`/`PUT /api/v1/settings/calendar-feeds` with `settings.changed`. Verify tests: default off, preset applies once, member `PUT` → 403, routes 404 `feeds_disabled` while off.
- [x] 4.2 Subscription routes (list, create with policy check and inline fetch, patch, delete, refresh) and the events route with the 92-day bound and the due-shaped times; the 12-per-hour hand-triggered limiter. Verify `TestCalendarFeeds*` in `internal/httpapi` covering 401, `private_target`, `limit_reached`, `insufficient_scope` for read and agent tokens, 404 for a foreign id, `rate_limited` on the thirteenth refresh, and `invalid_input` for a 100-day range.
- [x] 4.3 `internal/audit/events.go`: `calendar_feed.created`, `calendar_feed.rotated`, `calendar_feed.revoked` (no detail keys), listed in the personal activity set. Verify `go test ./internal/audit/...` and an `audit_routes_test` case showing the rotated event in `GET /api/v1/me/activity`.
- [x] 4.4 Feed token routes (`GET`/`POST`/`DELETE /api/v1/calendar-feeds/feed`, `requireFresh` on `POST`) and `GET /feeds/{secret}/tasks.ics` with the per-address and per-token limiters, `ETag`/304, `Cache-Control`, deactivated accounts refused. Verify tests: URL returned once, rotation invalidates the old secret, revoke → 404, stale session → `reauth_required`, the secret refused as a bearer token and as an app password, 11th unknown secret from one address → 429, 61st valid fetch → 429 with `Retry-After`.
- [x] 4.5 `internal/calfeed/feed.go`: `VEVENT` rendering per D6 (window, visibility like the CalDAV view, estimate or 30 min, `VALUE=DATE` all-day, `TZID` with `VTIMEZONE`, `RRULE`, `CATEGORIES`, stable `UID`, placeholder summary and no description or categories for encrypted accounts). Verify golden-file tests for the spec scenarios (Dentist 15:00 + 45 min, zoned weekly Monday, date-only, completed and undated excluded, shared project included, encrypted account) and a round trip through `caldav.Parse` proving the output folds and parses.
- [x] 4.6 `internal/httpapi/demo.go`: `{"Calendar feeds", false, prefix("/api/v1/calendar-feeds")}` and `{"Calendar feeds", false, prefix("/feeds")}`. Verify `demo_test` cases for a subscription POST, the events GET and a feed GET answering 403 `demo_restricted`, and that the worker is not started on a demo instance.
- [x] 4.7 `docs/api.md`: a "Calendar feeds" section (routes, bodies, error codes, the feed route and its limits) next to "CalDAV and app passwords"; `docs/webhooks.md`: the toggle also applies to calendar subscriptions. Verify `npm run docs:check` in web/.

## 5. Device cache and live refresh (design D8)

- [x] 5.1 `web/src/lib/types.ts`, `api.ts`: `CalendarSubscription`, `CalendarEvent`, `CalendarFeed`, the settings and route calls. `web/src/lib/db.ts`: the next free Dexie version with `calendarEvents` and `calendarSubscriptions` (every store redeclared), cleared at sign-out. Verify a vitest that stores and reads rows and that sign-out empties both tables.
- [x] 5.2 `web/src/lib/calendarFeeds.ts`: `ensureEventsFor(range)`, `refreshEvents`, the window and staleness rules, the `calendar.showEvents` meta key. Verify vitests with a mocked API: a range inside a fresh window makes no request, a 10-minute-old cache refreshes, an out-of-window range fetches `range ± 28 days`, an API failure keeps the cache.
- [x] 5.3 `web/src/lib/sync.ts`: listen for `event: calendar` and refresh on reconnect. Verify a vitest that a `calendar` event triggers one `refreshEvents` call and an `ops` event does not.

## 6. Events in Day and Week (design D8)

- [x] 6.1 `web/src/lib/calendar.ts`: `eventBlocks(events, date, zone)` (clipping across midnight, floating as wall time, zoned through `localDueOf`) and `allDayEvents(events, date)` for multi-day coverage. Verify unit tests for the spec scenarios: 22:00 to 02:00 split over two days, a two-day all-day event on both days, a `UTC` 08:00 event at 10:00 in `Europe/Berlin`.
- [x] 6.2 `CalendarView.tsx`: event blocks and chips through `layoutDay` with task blocks, `data-event` styling by subscription hue with outline-only for free, the all-day strip, the read-only popover on Enter, events excluded from `order` and drop targets, `dayLoad` unchanged. Verify component tests: a task at 10:30 and an event 10:00 to 11:00 both carry `data-overlap`, the header shows `30m / 8h`, dragging on an event writes nothing, Tab reaches the event and Enter opens the popover, and an axe check passes in light and dark.
- [x] 6.3 Toolbar "Calendars" toggle (`aria-pressed`, meta key) and the status text ("as of", "unavailable offline for these days"). Verify component tests for the toggle hiding blocks and chips after a reload of the view and for the two status texts with a stale cache and an out-of-window range.
- [x] 6.4 `docs/time-blocking.md`: a "See your other calendars" section with the toggle and the read-only rule, and a pointer to `docs/calendar-feeds.md`; refresh the Week screenshot if the layout check requires it. Verify `npm run docs:check`.

## 7. Settings panel (design D9)

- [x] 7.1 `CalendarFeedsPanel.tsx` in Settings → Integrations: owner switch, "Other calendars" card with rows, menu actions, confirm dialogs and the add/edit form, "Your tasks as a calendar" card with create, rotate, revoke and the shown-once URL dialog with setup notes, the encrypted-account notes, offline state, hidden on the demo, screen id `settings/calendar-feeds`. Verify component tests for the member-without-switch state, a failing row's text, the URL dialog appearing once, Delete confirming before the API call, and the `settingsSections` test; `npm run build` in web/.
- [x] 7.2 Audit labels for `calendar_feed.*` in the activity and audit panels. Verify `npm test`.
- [x] 7.3 Docs: new `docs/calendar-feeds.md` (subscribing, supported sources, limits and warnings, the feed URL with Google, Outlook and Apple steps, rotating and revoking, private networks, encryption, demo), `docs/settings.md` Integrations list, `docs/e2ee.md` two table rows, `docs/caldav.md` Limits pointer, `docs/self-hosting/coolify.md` variable table and `docs/self-hosting/demo.md`. Verify `npm run docs:build` and `npm run docs:check` in web/ and the help id resolves.

## 8. Integration

- [x] 8.1 Manual smoke on `make dev`: enable the switch, subscribe to a Google Calendar private address and an Outlook published calendar, check Day and Week against the source apps across a DST boundary, hide and show calendars, go offline and reopen the week; create the feed URL, subscribe from Google Calendar and Apple Calendar, confirm a timed task with an estimate shows as a block of that length and a date-only task as all-day, rotate and confirm the old URL stops. Record the result in the change folder notes.
- [x] 8.2 Run `make check` (go test, web test and build, docs check, template check). Verify it passes.

## Workflow follow-up

- Add a CHANGELOG.md entry under Unreleased (Added: calendar feeds both ways; the optional `OPENTODO_CALENDAR_FEEDS` variable; the webhooks private-network toggle now also governs calendar subscriptions).
- Mark ROADMAP.md row 8 of "Next: Parity and depth" as **Shipped.**
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
