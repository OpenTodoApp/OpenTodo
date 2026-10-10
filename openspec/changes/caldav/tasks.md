# Tasks

## 1. Schema, settings and app passwords

- [x] 1.1 Add `task.ical_extra` (nullable string) to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; verify `TestValidateAcceptsIcalExtra` (`go test ./...`) and `ops.test.ts` default case (`npm test`)
- [x] 1.2 Migration adding `app_passwords` and, if absent, `settings`; verify `TestMigrationAppPasswords` on a database at the previous version (`go test ./...`) — `0019_caldav.sql`, which also adds the `caldav_resources` side table (design, implementation notes)
- [x] 1.3 `internal/auth`: create/list/revoke app passwords (`otap_` prefix, hashed, shown once), `UserByAppPassword`; verify `TestAppPasswordLifecycle` and `TestAppPasswordIsNotAnAPIToken` (`go test ./...`)
- [x] 1.4 Routes `GET/POST /api/v1/app-passwords`, `DELETE /api/v1/app-passwords/{id}` behind `requireAuth`; owner-only `GET/PUT /api/v1/settings/caldav`; `OPENTODO_CALDAV` preset in `internal/config`; verify `TestAppPasswordRoutesRequireAuth`, `TestCaldavSettingForbidsMembers`, `TestCaldavSettingInvalid400` (`go test ./...`) — `GET` is readable by every signed-in user, only `PUT` is owner-only (see design)

## 2. iCalendar and WebDAV plumbing

- [x] 2.1 `internal/caldav/ical`: tokenizer (unfolding, escaping, parameters), VTODO model, serialiser with folding; verify `TestICalRoundTripFixtures` over fixtures recorded from Apple Reminders, Thunderbird and Nextcloud Tasks, and `FuzzParseICal` never panics (`go test ./...`) — lives in `internal/caldav` (ical.go, vtodo.go). The fixtures are written in each client's style (PRODIDs, VTIMEZONE, VALARM, X- properties, RELATED-TO, IN-PROCESS), not captured from real installations; see 5.1. Fuzzed for 90 s with no failure after two fixes (regression inputs kept under testdata/fuzz)
- [x] 2.2 Mapping VTODO ⇄ task: summary, description, due (DATE / floating DATE-TIME / TZID conversion), priority table, status and completed, categories, RELATED-TO parent, created, remainder into `ical_extra`; verify `TestMapPriorityRoundTrip`, `TestDueMapping`, `TestUnmappedPropertiesPreserved` (`go test ./...`) — TZID now maps to a zoned due (absolute-datetimes); RRULE maps to `recurrence` where expressible (`TestRRULERoundTrip`)
- [x] 2.3 `internal/caldav/dav`: PROPFIND/PROPPATCH/REPORT XML request parsing and multistatus responses, 207/412/415/403 precondition bodies; verify `TestMultistatusShape` against golden files (`go test ./...`)

## 3. CalDAV handlers

- [x] 3.1 Mount `/dav/` and `/.well-known/caldav`, 404 while disabled, Basic auth with app passwords only, rate-limited failures; verify `TestDavDisabledIs404`, `TestDavRejectsAccountPasswordAndTokens`, `TestDavRateLimit` (`go test ./...`)
- [x] 3.2 Discovery and collections: principal, calendar home, Inbox and per-project calendars with displayname, colour, supported-calendar-component-set VTODO, getctag, sync-token; archived and deleted projects and other users' projects hidden; verify `TestDiscoveryListsOwnCalendarsOnly`, `TestArchivedProjectHidden` (`go test ./...`) — shared projects appear for members, read-only for viewers
- [x] 3.3 GET/HEAD, `calendar-multiget`, `calendar-query` with VTODO comp-filter and time-range; verify `TestCalendarQueryTimeRange` (`go test ./...`)
- [x] 3.4 PUT create/update through `sync.Apply` with `device: "caldav"`, one op per changed property, project move on cross-calendar PUT, 412 on stale `If-Match` or `If-None-Match: *`, 415/403 on invalid bodies, 201 with ETag; verify `TestPutCreatesTaskViaOps` (no direct row writes), `TestPutEmitsOnlyChangedFields`, `TestStaleIfMatch412`, `TestConcurrentFieldEditsConverge` (`go test ./...`) — `ApplyStrict` with device `caldav:<app-password-id>`; cross-scope moves copy and tombstone (`TestMoveIntoSharedProjectCopies`)
- [x] 3.5 DELETE as tombstone, completion/reopen mapping, completed tasks listed; verify `TestDeleteIsTombstone`, `TestLaterReopenWinsOverCaldavComplete` (`go test ./...`) — recurring completion moves the series (`TestRecurringCompletionMovesSeries`)
- [x] 3.6 ETag derivation from field clocks, CTag/sync-token from `seq`, `sync-collection` with changed and removed members; verify `TestEtagChangesOnDeviceEdit`, `TestSyncCollectionReportsRemoved` (`go test ./...`) — ETag hashes the served body (which carries the newest field clock); removed members include purges
- [x] 3.7 MKCALENDAR → project, PROPPATCH displayname/colour → rename/recolour, DELETE calendar → soft-delete project and move open tasks to Inbox, Inbox protected with 403; verify `TestMkcalendarCreatesProject`, `TestDeleteCalendarMovesTasksToInbox`, `TestInboxProtected` (`go test ./...`)

## 4. Web app

- [x] 4.1 Settings → CalDAV: owner toggle with status, per-user app passwords (create shows secret once, list, revoke), server URL and per-client setup hints, warning when the base URL is not https; verify `caldavSettings.test.tsx` (`npm test`, `npm run build`) and keyboard reachability in the browser flow — keyboard reachability checked structurally (native inputs and buttons only, asserted in `caldavSettings.test.tsx`); no browser run was made
- [x] 4.2 Ensure materialised tasks with `ical_extra` render unchanged in all views and the field survives local edits (`applyOps` keeps unknown-to-UI fields); verify `ops.test.ts` case `keepsIcalExtraOnTitleEdit` (`npm test`)

## 5. Integration and docs

- [ ] 5.1 Manual conformance run against the production binary with Thunderbird, Apple Reminders (iOS or macOS) and Nextcloud Tasks: discover, create list, create task with alarm, complete, edit from the web app, confirm both directions and that the alarm survives; record each client's fixtures under `internal/caldav/testdata/`; verify no 5xx in server logs and `go test ./...` green with the new fixtures — NOT DONE: no real clients are available in the build environment. A curl run against the production binary (well-known redirect, discovery, MKCALENDAR, PUT with TZID and VALARM, GET, sync-collection, DELETE) passed with no 5xx in the log; the fixtures in `internal/caldav/testdata/` are client-style, not recorded
- [x] 5.2 Docs: `docs/caldav.md` (enable, create app password, per-client setup, mapping table, limits), `docs/api.md` (app-password and setting routes), `docs/sync.md` (device id `caldav`), README, `ROADMAP.md`, `CHANGELOG.md` Unreleased; verify links resolve and `make check` passes
