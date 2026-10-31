# Tasks

Backend tasks run `go test ./...`; frontend tasks run `npm test` and `npm run build` in `web/`. `make check` runs before the last task. Task 0 is the owner's decision (design D1); if the owner picks option (a), drop 1.1–1.3 and 2.1 and ship the route, the resource and the docs without the `focus` object.

## 0. Decision

- [x] 0.1 Owner confirms design D1 option (c). Verified by the decision recorded in design.md.

## 1. Op schema

- [x] 1.1 Add `focus_mode`, `focus_session` and `planned_end_at` to `time_entry` in `internal/sync/ops.go` `Schema` with the D2 bounds and author-only writes; update `internal/sync/testdata/schema_fixture.json`. Verified by `go test ./internal/sync/...` (valid values, `planned_end_at` before `started_at` refused, session 120 refused, another member's write `forbidden`, defaults on an old entry).
- [x] 1.2 Add the fields to `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. Verified by the schema-fixture test in `npm test`.
- [x] 1.3 Not in `internal/e2ee.ContentFields` or `CONTENT_FIELDS`: verified by the existing test that compares the two lists staying green.

## 2. Focus screen

- [x] 2.1 The Focus screen writes the three fields with every work-stretch start and resume (`planned_end_at` from the remaining time), and writes `planned_end_at` again when a stretch's length changes. Verified by `web/src/app/focus` tests: third Pomodoro, resume after a pause, Flowtime without an end, Countdown offline, no fields without time tracking.

## 3. Reads

- [x] 3.1 Entry representations carry `focus` (REST lists, `?running=true`, JSON export); the CSV export is unchanged. Verified by `timeentries_test.go` and the export test.
- [x] 3.2 `GET /api/v1/time-entries/running` registered with `signedIn` in `internal/httpapi/timeentries.go`: own entry only, `taskTitle`, `serverTime`, 200 with `null`. Verified by `timeentries_test.go` (read token, nothing running, another member's entry, 401, 405) and `policy_test.go`.
- [x] 3.3 MCP: `focus` on `list_time_entries` entries; resource `opentodo://time-entries/running` with exclusions. Verified by `internal/agenttools` and `internal/mcp` tests.
- [x] 3.4 `ot time` shows the running entry's mode, session and planned end. Verified by `internal/cli/time_test.go`.

## 4. Documentation

- [x] 4.1 `docs/api.md` (the route, the `focus` object, the route matrix), `docs/mcp.md` (the field and resource), `docs/sync.md` (the fields), `docs/focus.md` ("Show the session elsewhere": what is visible, breaks and pauses are not), `docs/home-assistant.md` (a REST sensor example). Verified by `npm run docs:check`.
- [x] 4.2 No new UI strings, so no translation work. Verified by `make i18n-check` unchanged.
- [x] 4.3 CHANGELOG entry under Unreleased (at apply time). Verified by `make check`.
- [x] 4.4 `make check` passes.
