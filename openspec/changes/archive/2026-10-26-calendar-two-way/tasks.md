# Tasks

## 1. Data and shared pieces

- [x] 1.1 Migration `0047_calendar_sync.sql`: `calsync_connections`, `calsync_links`, `calsync_oauth`, `calsync_calendars` (verify: `go test ./internal/store/...`)
- [x] 1.2 `calfeed`: `WriteEvent` for one task (the feed's event code), `Event.LastModified`, managed subscriptions left out of List, Due, NextFetch and the limit; `EnsureManaged`/`DropManaged` (verify: `go test ./internal/calfeed/...`)
- [x] 1.3 Reserved device prefix `calsync:` in `internal/sync/devices.go` and the history label in `web/src/lib/history.ts` (verify: `go test ./internal/sync/...`, `npm test`)
- [x] 1.4 Audit constructors `calendar_connection.created|updated|deleted` in the catalogue and the personal list (verify: `go test ./internal/audit/...`)
- [x] 1.5 Config `OPENTODO_GOOGLE_CLIENT_ID`, `OPENTODO_GOOGLE_CLIENT_SECRET`, `OPENTODO_GOOGLE_CLIENT_SECRET_FILE`, none required (verify: `go test ./internal/config/...`)

## 2. internal/calsync

- [x] 2.1 Store: connections, links, OAuth states, schedule, backoff and stop reasons (verify: store tests)
- [x] 2.2 Secrets file with sweep that keeps `google.client_secret` (verify: secrets test)
- [x] 2.3 DAV client on `internal/outbound`: PROPFIND, REPORT, GET, PUT, DELETE, hand-followed redirects within the parent domain, 4 MB bodies, error reasons (verify: client tests)
- [x] 2.4 Discovery from a URL, host or email: well-known, principal, home, VEVENT calendars, read-only ones (verify: discovery tests against `calsynctest`)
- [x] 2.5 Google OAuth: authorization URL with PKCE, code exchange, refresh with a cached access token, `invalid_grant` as `unauthorized` (verify: tests with a fake token endpoint)
- [x] 2.6 Event mapping in task terms (snapshot), pull rules and ops, conflict rule (verify: mapping and cycle tests)
- [x] 2.7 Cycle: target check, pull with sync-collection or ETag listing, multiget, push with If-None-Match/If-Match, 412 handling, deletion, read calendars into managed subscriptions (verify: cycle tests against sync-token and non-sync-token servers)
- [x] 2.8 Worker: tick, at most 2 in flight, per-connection lock, debounced trigger from the observer, sweep (verify: worker tests)
- [x] 2.9 `calsynctest`: in-process CalDAV server for VEVENT with and without sync tokens (verify: used by 2.4 and 2.7)

## 3. HTTP, wiring

- [x] 3.1 `ownerSwitch` helper; calendar sync and issue connections use it (verify: `go test ./internal/httpapi/...`)
- [x] 3.2 Routes in `internal/httpapi/calsync*.go` with the policies of design D14, deny-list entries, the policy table test (verify: `TestSecurityRoutePolicies`, `TestDemoDenyListMatchesPolicy`, calsync route tests)
- [x] 3.3 Events route answers for managed subscriptions while either switch is on (verify: calfeed route tests)
- [x] 3.4 Tenant wiring: worker, observer, jobs; host scheduler on the calendars entry (verify: `go test ./internal/tenant/... ./internal/host/...`)

## 4. Web

- [x] 4.1 Types and API methods (verify: `npm run build`)
- [x] 4.2 `CalendarSyncPanel` under Settings → Integrations → Calendar sync: owner switch, Google client, connections, CalDAV form, Connect Google, calendar choice with the Combobox (verify: `calendarSyncPanel.test.tsx`)
- [x] 4.3 Strings in every catalog (verify: `make i18n-check`)

## 5. Docs and checks

- [x] 5.1 `docs/calendar-sync.md` and links from `calendar-feeds.md`, `other-calendars.md`, `caldav.md`; `docs/api.md`; `docs/README.md` (verify: `make docs-check`)
- [x] 5.2 ROADMAP.md row, CHANGELOG Unreleased, AGENTS.md layout line (verify: review)
- [x] 5.3 `make openspec-validate` and `make check` (verify: both pass)

## 6. On archive

- [x] 6.1 Add `calendar-sync` to `specs` in the front matter of `docs/calendar-sync.md` once `openspec/specs/calendar-sync/` exists; docs-check refuses spec names that are not there yet (verify: `make docs-check`)
