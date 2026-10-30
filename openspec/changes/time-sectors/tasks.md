# Tasks

## 1. Rules module and shared vectors

- [ ] 1.1 `web/src/lib/sectors.ts` with `parseSector`, `currentPeriods`, `relativeName`, `isCarried` and `resolvePhrase`, and `web/src/lib/sectors.vectors.json`. The vectors cover validity (W53 in 2026 and not in 2027, months, quarters, years 2000–2999), Monday, Sunday and Saturday week starts, year and quarter boundaries, and carry-over. Verify with `sectors.test.ts` (`npm test`).
- [ ] 1.2 Go twin `internal/sector` running the same vectors. Verify with `go test ./internal/sector/...`.
- [ ] 1.3 Shared availability predicate `isAvailable(task, ctx)` in `web/src/lib`: open, not deleted, not deferred, not blocked, plus the Sequential rule from `project-flow-modes` once it has landed. Reuse that change's predicate if it exists instead of adding a second one. Verify with a unit test that Next and the planning list agree on the same fixture.

## 2. Data model

- [ ] 2.1 Add `task.sector` (kString, default `""`, validated with `internal/sector`) and `user_prefs.time_sectors` (kString, default `""`) to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. Neither is a content field. Verify with `go test ./internal/sync/...` (an invalid sector is refused, an older op without the field still applies, LWW on concurrent writes) and `npm test` (`ops.test.ts`).
- [ ] 2.2 REST: `sector` in task representations and PATCH/POST, with a REST `null` stored as `""` and `400 invalid_input` for a bad period. Verify with `go test ./internal/httpapi/...` (create, patch, invalid, export includes the field).
- [ ] 2.3 Inbox rule: a non-empty sector makes a task scheduled in `web/src/lib/inbox.ts`, `internal/inbox` and `inbox.vectors.json`. Verify with `npm test` and `go test ./internal/inbox/...` running the new vector.
- [ ] 2.4 Activity: a sector change is shown like a start change in `internal/activity` and `web/src/lib/activity.ts`, with a case in `internal/activity/testdata/activity_fixture.json`. Verify with `go test ./internal/activity/...` and `npm test`.

## 3. Client: placement, setting and planning

- [ ] 3.1 Placement:
  - Anytime excludes sectored tasks.
  - Today includes a sectored task only through the deadline rule.
  - Rows show the sector chip in the date slot, with carried-over chips in the faint tone.
  - A dated task with a sector is placed by its date.

  Verify with view tests in `npm test` (Anytime, Today, project list), plus an offline week-boundary test with fake timers.
- [ ] 3.2 The When popover's Sector segment:
  - quick choices with periods, "Later…" period picker, Clear;
  - disabled for repeating tasks;
  - read-only for viewers;
  - one batch clearing due, start and evening, and the reverse when a date is set.

  Verify with an interaction test (`// @vitest-environment happy-dom`) that asserts the ops of each batch and one Undo, and with a story in both themes (`make storybook`, `make ui-check`).
- [ ] 3.3 Command palette "Set time sector…" for the selection, skipping repeating tasks with a count in the toast. Verify with a palette test and with the shortcut registry test, which shows no new conflict.
- [ ] 3.4 Planning list source "Time sectors":
  - groups in the D5 order, with counts and estimate sums;
  - only available tasks, with a waiting footer;
  - `s` placement and drag set due and clear the sector as one undoable change;
  - "Do today" respects the Today limit of `today-closed-list` when present;
  - falls back to the Inbox when the switch is off.

  Verify with planning list tests in `npm test` and a story.
- [ ] 3.5 Settings → Account → How you work: the Time sectors switch writing `user_prefs.time_sectors`, off by default. Verify with a settings test (writes one op, an unknown value is kept and reads as off) and by updating `settingsCopy.test.ts`.
- [ ] 3.6 Weekly review Look ahead section with row actions. `n` still parks. Verify with a review test covering carried over, Next week, offline and switch off.
- [ ] 3.7 i18n: every new string (segment, chips "From week 43", groups, settings copy, toasts) in the six languages (en, de, fr, it, es, pt). Verify with `node scripts/i18n-check.mjs` (`make i18n-check`).
- [ ] 3.8 Phone layout: the When sheet wraps the quick choices at 360 px, and the planning list doesn't open by itself. Verify with a 360 px story baseline and `make ui-lint`.

## 4. Capture and filters

- [ ] 4.1 Quick add phrases: `sectorPhrases` in `internal/quickadd/vocab.json` for en, de, fr, it, es and pt, the `sectors` parse option in the web parser and in `internal/quickadd`, and vectors with the switch on and off (including `next week` keeping its date and a date-wins line). Verify with `npm test` (nlp tests) and `go test ./internal/quickadd/...`.
- [ ] 4.2 `POST /api/v1/quick-add/parse` and `ot add` read the user's `time_sectors`. Verify with `go test ./internal/httpapi/...` (parse with the switch on and off).
- [ ] 4.3 Filter terms `sector`, `no sector`, `carried` and `sector: <name|period>` in the web evaluator and in `internal/filter` validation, plus the published grammar. Verify with `npm test` (filter tests) and `go test ./internal/filter/...` (an invalid period is refused when a view is saved).

## 5. Interop

- [ ] 5.1 CalDAV `X-OPENTODO-SECTOR` in `internal/caldav` mapping (serve, set, invalid kept in `ical_extra`, absent leaves the field unchanged). Verify with `go test ./internal/caldav/... ./internal/httpapi/...`.
- [ ] 5.2 Vault `[sector:: …]` in `internal/vault` line grammar, the fixture vault and the `docs/vault.md` vectors. Verify with `go test ./internal/vault/...`.
- [ ] 5.3 MCP and agent tools:
  - `sector` in `create_tasks` and `update_tasks` (absolute only);
  - in results and resources;
  - the `list_tasks` `sector` filter.

  Do this in `internal/agenttools` and `internal/mcp`. Verify with `go test ./internal/agenttools/... ./internal/mcp/...` (relative word refused with `-32602`).
- [ ] 5.4 CLI `--sector` on `add`, `edit` and `list`, the DUE cell, `--json`, `ot schema` and the `ot skill` text. Verify with `go test ./internal/cli/...`.

## 6. Documentation

- [ ] 6.1 New `docs/time-sectors.md` (what a sector is, the switch, planning from sectors, carry-over, phrases in six languages, CalDAV and vault mapping). Also:
  - pointers from `docs/deadlines-and-start-dates.md`, `docs/time-blocking.md`, `docs/filters.md`, `docs/quick-add.md` and `docs/vault.md`;
  - `docs/api.md` (the task field, MCP arguments);
  - `docs/caldav.md`;
  - a `docs/README.md` row.

  Verify with `make docs-check`.
- [ ] 6.2 CHANGELOG Unreleased "Added" entry. Verify by the entry being present under Unreleased in the PR diff.

## 7. Integration

- [ ] 7.1 `go test ./...`, `cd web && npm test && npm run build`, and `make check` (TZ=UTC) all pass.
- [ ] 7.2 Manual smoke on `./bin/opentodo`:
  1. Turn the switch on.
  2. Add `Draft budget this week`.
  3. Plan it onto Thursday from the planning list.
  4. Undo.
  5. Advance the device date past Sunday and see "From week 44".

  Verify by the observable result of each step.
