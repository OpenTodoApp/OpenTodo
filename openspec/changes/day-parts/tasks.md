# Tasks

## 1. Field, preference and the part helpers

- [ ] 1.1 Add the `kDayPart` kind (null, `morning`, `afternoon`) and `task.day_part` to `internal/sync/ops.go` `Schema`, and `user_prefs.day_parts` (kString, ""); add both to `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; verify `go test ./internal/sync/...` rejects `"night"` and `npm test -- ops`
- [ ] 1.2 `dayPartOf(task)` and the write pairing `dayPartFields(part)` in `web/src/lib/dayParts.ts` and the Go equivalent used by REST, CalDAV, vault and agent tools; verify unit tests that no helper ever emits `evening: true` with a non-null `day_part`, and the old-client case (evening over morning reads Evening)
- [ ] 1.3 Keep the part on reschedule, series advance, habit completion and in the occurrence record; verify `npm test -- recurrence habits` and `go test ./internal/recurrence/...`
- [ ] 1.4 Activity label "the part of the day" in `web/src/lib/activity.ts` and `internal/activity`, with a case in `internal/activity/testdata/activity_fixture.json`; verify both test suites

## 2. Today grouping and controls

- [ ] 2.1 `groupToday` returns morning and afternoon groups and the time-derived placement (12:00 and 18:00 in the viewer's zone) only when the preference is on; `listGroups.ts` heads them and implies the part on rows; verify `npm test -- dayLists listGroups` including "preference off is unchanged"
- [ ] 2.2 The Do on segment's four-way control (Evening toggle kept while off), the Actions menu "Day part…" submenu, palette commands, and drop targets on part headings writing the pairing with Undo; viewers read-only; verify interaction tests (happy-dom) and `Shift+E` unchanged
- [ ] 2.3 Part chip outside Today and in Today while off; Settings → Preferences → Today switch and the overflow menu item gated by the mode; verify `npm test -- preferencesPanels` and that a `lists` user sees no new control
- [ ] 2.4 Phone check at 360 px and the interface budget; verify `make ui-check` and `budget.test.tsx`

## 3. Quick add (TypeScript and Go)

- [ ] 3.1 Add `morningWords`, `afternoonWords` and `partWords` to the six vocabularies in `web/src/lib/nlp/vocab/*.ts`, the `dayParts` parser option and the chips; verify `npm test -- nlp quickadd`
- [ ] 3.2 Add vector cases (tomorrow morning, this afternoon, fri evening, "Morning run tomorrow" literal, preference off, one per language) to `web/src/lib/nlp/quickadd.vectors.json`; regenerate `internal/quickadd/vocab.json` and `internal/importer/nlpvocab.json` (`UPDATE_NLP_VOCAB=1 npx vitest run src/lib/nlp/vocabExport.test.ts`); port to `internal/quickadd`; verify `go test ./internal/quickadd/... ./internal/importer/...`
- [ ] 3.3 `POST /api/v1/quick-add/parse` accepts `day_parts`; update `docs/api.md`; verify `go test ./internal/httpapi/...`

## 4. Integrations

- [ ] 4.1 Filter keywords `morning` and `afternoon` in the TS evaluator and `internal/filter`; verify `npm test -- filter` and `go test ./internal/filter/...`; document in `docs/filters.md`
- [ ] 4.2 CalDAV `X-OPENTODO-DAY-PART` encode and decode with the pairing and `ical_extra` fallback; verify `go test ./internal/caldav/... ./internal/httpapi/...`; document in `docs/caldav.md`
- [ ] 4.3 Vault `[daypart:: …]` read, write, order and error report; update the fixture vault and `docs/vault.md`; verify `go test ./internal/vault/...`
- [ ] 4.4 MCP/agent tools accept and return `day_part`; verify `go test ./internal/agenttools/... ./internal/mcp/...`; document in `docs/mcp.md`
- [ ] 4.5 `ot add/edit --part`, `ot show`/`--json`, CLI parsing follows the preference; verify `go test ./internal/cli/...`; document in `docs/cli.md`

## 5. Docs, i18n, release notes

- [ ] 5.1 Strings in the six locales for the headings, control, submenu, palette commands, chips and setting; verify the locale completeness test
- [ ] 5.2 Document day parts in `docs/deadlines-and-start-dates.md` (This Evening section) and `docs/today-and-upcoming.md`, and the phrases in `docs/quick-add.md`; verify `make repo-check`
- [ ] 5.3 CHANGELOG entry under Unreleased at archive time; verify `make check`
