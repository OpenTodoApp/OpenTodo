# Proposal

## Why

CalDAV is how people keep using the to-do app they already know (Apple Reminders, Thunderbird, Tasks.org through DAVx⁵) while OpenTodo holds the data. The research names "robust CalDAV: no data loss, large sets, Tasks.org subtask hierarchy" as the main complaint about Vikunja, the closest self-hosted competitor (research §1, Vikunja). OpenTodo's mapping is thorough and pinned by protocol tests. But the verification table in `docs/caldav.md` still says "not verified" for Apple Reminders on iOS and macOS, DAVx⁵ with Tasks.org and jtx Board, and Mitra. Only Thunderbird and todoman were run against a real server (2026-10-22). Issue #9 asks testers for exactly these clients. The largest CalDAV test today uses 2,000 tasks, while the 1.0 performance target is 10,000 (`performance-10k`).

1.0 is the release that has to be trusted. A sync protocol that has never met the client someone uses is the riskiest thing to call stable.

## What Changes

- **Every listed client run on the real app before 1.0.** Apple Reminders (iOS and macOS), DAVx⁵ with Tasks.org, DAVx⁵ with jtx Board, Thunderbird and Mitra are run through the same scripted scenario that Thunderbird and todoman went through. Each cell of the verification table then holds a client version, a date and a result. A cell may still say "not supported by the client", with the reason. "Not verified" is no longer allowed in a 1.0 release for the Apple, DAVx⁵ and Thunderbird rows.
- **Recorded fixtures per client.** What each client sent during the run is kept as sanitised `.ics` fixtures under `internal/caldav/testdata/<client>-<version>/`, and pinned by tests the way `caldav_clients_test.go` pins Thunderbird and todoman. A later mapping change that would break one of them fails CI.
- **A Tasks.org subtask hierarchy check.** Subtasks created in Tasks.org (`RELATED-TO;RELTYPE=PARENT`) arrive as subtasks, and OpenTodo's subtasks show nested in Tasks.org, three levels deep.
- **Large-account tests at 10,000 tasks.** A seeded account of 10,000 tasks across 20 calendars gets an initial PROPFIND and calendar-query of one calendar, a `sync-collection` after one change, and a multiget of 500 hrefs. Each has a time and allocation budget in `go test`, so a regression fails CI.
- **Calendar sync verified against real servers.** The client side (`calendar-sync`) is run against Fastmail, iCloud and Nextcloud CalDAV, and Google Calendar, with the result recorded in `docs/calendar-sync.md` in the same table form.
- **A written scenario script.** `docs/caldav-verification.md` is the step-by-step script a tester follows, so community reports on issue #9 are comparable. A report becomes a row update plus fixtures through a pull request.

No change to the mapping is planned. If a run finds a defect, the fix is a separate small change that names the client and the fixture. No op field, no route, no environment variable. Not **BREAKING**.

## Out of scope

- New CalDAV features: VEVENT collections, scheduling, sharing through CalDAV, per-occurrence overrides. These stay as listed under Limits in `docs/caldav.md`.
- Outlook and Microsoft 365. That is `outlook-calendar-sync` (0.20) and uses Microsoft Graph, not CalDAV.
- Clients not listed (Evolution, GNOME To Do, Errands, 2Do, Fantastical). The script lets the community add them later; they are not a 1.0 gate.
- The other items of issue #9 (SSO, IMAP, MCP, voice, push, passkeys, touch drag, Firefox share). Each belongs to its own area's verification.

## Roadmap

1.0 "Trust", row `caldav-verified`. It advances ROADMAP.md §6 "CalDAV" and closes the CalDAV part of issue #9. It shares the 10,000-task fixture with `performance-10k`.

Relates to #9

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `caldav-sync`: "Real-client verification" becomes a release gate with recorded fixtures per client. New requirements "Subtask hierarchy with real clients" and "Large-account budgets".
- `calendar-sync`: new requirement "Verified against real calendar servers".

## Impact

- **Data model, sync, op schema, E2EE:** none. CalDAV already refuses encrypted accounts' content as documented, and that stays as is.
- **API, CLI, MCP:** none.
- **Code:** test fixtures and tests in `internal/caldav/testdata/`, `internal/httpapi/caldav_*_test.go` and `internal/calsync` (recorded server responses). There is no production code unless a run finds a defect.
- **Docs:** `docs/caldav.md` (table), `docs/calendar-sync.md` (new table), a new `docs/caldav-verification.md`.
- **Binary and bundle size:** none; fixtures are test-only.
