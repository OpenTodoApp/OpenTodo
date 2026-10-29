# Design

## Context

- **What exists.** The CalDAV server (`internal/caldav`, `internal/httpapi/caldav*.go`) has protocol tests and recorded-style fixtures for every client in the table: `apple-reminders.ics`, `davx5-tasks.ics`, `mitra/`, `thunderbird.ics`.
- **Real runs.** Only Thunderbird 158.0.1 and todoman 4.7.0 were run against a real server. Their requests are kept in `thunderbird-158/` and `todoman-4.7/` and pinned by `caldav_clients_test.go`.
- **The cost test.** `caldav_cost_test.go` checks that a multiget's cost per href does not grow with the account, at 2,000 tasks.
- **Calendar sync.** Calendar sync (`internal/calsync`) is the client side. It is tested against the in-process `calsynctest` server and recorded Google responses, but no real-server run is recorded.

This change is verification work. Its deliverables are fixtures, tests, a script and filled tables. It changes no behaviour, unless a run finds a defect.

## Decisions

**D1. One scripted scenario, the same for every client.**
- `docs/caldav-verification.md` lists numbered steps, one block per behaviour column of the table:
  - due forms (date only, timed);
  - deadline;
  - the inbound date shapes;
  - estimates;
  - alarms both ways;
  - completing an occurrence of a repeating task;
  - moving between calendars;
  - deletion;
  - incremental sync;
  - the new subtask hierarchy column.
- Each step says what to do in the client, what to check in OpenTodo, and the reverse.
- The tester runs the server with `OPENTODO_LOG_LEVEL=debug` and the CalDAV request log (D2).
- Alternative: free-form reports. Rejected: issue #9 reports would not be comparable, and the table needs one result per cell.

**D2. Fixtures captured from the request log, sanitised by a script.**
- A test-only helper, `internal/caldav/capture` (a `go run` command never linked into the server, like `internal/importer/sanitize`), turns a debug log of CalDAV PUT bodies into numbered `.ics` files.
- It replaces UIDs with placeholders and rewrites SUMMARY, DESCRIPTION, CATEGORIES and LOCATION text with neutral words. It keeps every property name, parameter and date value.
- The debug log already exists; the capture adds no logging to the server.
- Alternative: a recording proxy. Rejected: a second program to install for testers, for the same result.

**D3. "Verified" has a precise meaning.** A cell may hold one of three things:
1. `works` plus notes. The step was performed on the named client version and the fixture of that step is pinned by a test.
2. `not supported by <client>: <reason>`, for example "jtx Board has no alarms on tasks".
3. `defect #<issue>`, until the fix lands.

At the 1.0 tag, `not verified` is allowed only in the Mitra row (a small third-party client; its recorded-style fixtures stay). A repo check (`scripts/repo-checks.test.mjs`) reads the table and fails if any other row has a `not verified` cell, or if a row names no client version.

**D4. Large-account budgets measured in `go test`, not wall clock alone.**
- A 10,000-task account across 20 calendars is seeded through `sync.Apply`, with the fixture generator shared with `performance-10k`: `internal/perfseed`, deterministic from a seed.
- Allocation counts and response sizes are stable across machines and are the hard gates.
- Wall-clock budgets are generous ceilings: they catch an accidental O(n²) without flaking on a slow CI runner.

| Request | Gate (allocations, size) | Ceiling (time, CI runner) |
|---|---|---|
| PROPFIND Depth 1 of one 500-task calendar | allocations per resource no more than 1.5× the 50-task case | 1 s |
| calendar-query, plain filter, one 500-task calendar | each task encoded once (counted) | 1.5 s |
| `sync-collection` after one change | exactly one response element; allocations independent of account size within 10 % | 100 ms |
| calendar-multiget of 500 hrefs | per-href allocations no more than 1/4 of the account size divided by 1,000 | 1.5 s |
| PROPFIND Depth 1 of the calendar home (20 calendars) | no task encoded | 200 ms |

The existing 2,000-task cost test stays; the new one sits next to it in `caldav_large_test.go`, skipped under `-short`. CI runs it in the normal Go job, where `-short` is not set.

**D5. Subtask hierarchy is its own column.** Tasks.org and jtx Board both nest via `RELATED-TO;RELTYPE=PARENT` (or untyped `RELATED-TO`), and Apple Reminders iOS 17+ shows subtasks for CalDAV lists only partly. The column checks three levels both ways, and whether moving a parent to another calendar takes the children with it, as OpenTodo's move does.

**D6. Calendar sync gets the same table.** Four servers: iCloud, Fastmail, Nextcloud 30 and Google Calendar. Five columns:
1. connect (discovery);
2. task to event;
3. move or resize back;
4. delete back;
5. incremental sync (sync token or ctag fallback).

Recorded responses become `calsynctest` replay fixtures. Fastmail is verified here, as a calendar-sync target. It does not act as a CalDAV client of OpenTodo, because it has no VTODO client.

**D7. Who runs it.** The maintainers run Apple (both platforms, own devices), Thunderbird, and DAVx⁵ with Tasks.org and jtx Board (Android device or emulator). Fastmail and iCloud need a personal account: the maintainer's, sanitised. Community runs from issue #9 are welcome and merged the same way.

## Progressive disclosure and interface budget

No screen changes. The tables live in the docs.

## Risks

- **Apple Reminders ignores fields or changes its behaviour across iOS releases.** The row names the iOS version, and the docs say results apply to that version.
- **A real run finds a defect late in 1.0.** Mitigation: these runs happen first in the 1.0 milestone, so fixes have time.
- **Flaky time ceilings.** The ceilings are 5–10× the measured local time, and the allocation gates are the real check.

## Size

The capture helper and the fixtures are test-only, so there is no effect on the binary, the image or memory.
