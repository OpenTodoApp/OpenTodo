# Tasks

## 1. Schema and preferences

- [ ] 1.1 Add `user_prefs.today_limit` (kNumber, 0), `user_prefs.today_done` (kString, ""), `review.slots_date` and `review.slots` (kString, "") to `internal/sync/ops.go` `Schema` with comments, to `web/src/lib/types.ts` and to the defaults in `web/src/lib/ops.ts`; verify `go test ./internal/sync/...` and `npm test -- ops` in web/
- [ ] 1.2 Read helpers that turn an empty, out-of-range or non-integer limit into off and an empty Done today value into the mode default, without writing; verify a unit test in `web/src/lib/prefs` covering `0`, `40`, `2.5`, `""` and each mode

## 2. Slot rule (Go and TypeScript twins)

- [ ] 2.1 Write `web/src/lib/closedList.vectors.json` (focus first, taken order, Earlier oldest first, creation order with id ties, blocked and habit excluded, sequential task excluded through the injected predicate, list of another day ignored, completed ids dropped, all slots chosen) and `web/src/lib/closedList.ts` `fillSlots`; verify `npm test -- closedList`
- [ ] 2.2 Port it to `internal/closedlist` (pure, standard library) reading the same vectors; verify `go test ./internal/closedlist/...`
- [ ] 2.3 Inject the available-task predicate from `project-flow-modes` when present, else "not blocked"; verify both cases in the vectors

## 3. Today screen

- [ ] 3.1 In `web/src/lib/listGroups.ts` split Today's rows into slots and a folded "Waiting for a slot" group after Blocked (open key per device, count, hint line) and add the "Done today" group (folded, count, newest first, logical day); verify `npm test -- listGroups dayLists`
- [ ] 3.2 Lead line "3 of 5 · 4 done" in Today's `PageHeader` meta; verify a test in `web/src/app` and the interface budget test (`budget.test.tsx`) stays green
- [ ] 3.3 Take a slot / Give back the slot as row action, task Actions menu item and palette commands writing `review.slots_date` and `review.slots` through `mutate()`, refusing when every slot is chosen; verify an interaction test (happy-dom) including the refusal and an offline write
- [ ] 3.4 Log a win: the add row of Done today, the palette command and quick add's "Log as done" switch creating the task with `completed_at` and `completed_by` in one batch; recurrence and reminder chips refused; view-only projects excluded; verify `npm test -- quickAdd logbook` and that Completed and Close the day count it
- [ ] 3.5 Settings → Preferences → Today card (limit choices with Custom 1–20, Done today switch) and Today's overflow items gated by the mode; verify `npm test -- preferencesPanels` and a test that a `lists` user sees no new overflow item
- [ ] 3.6 Phone: Take a slot in the long-press menu, groups at 360 px without horizontal scroll; verify `phone.stories.tsx` story and `make ui-check`

## 4. CLI and MCP

- [ ] 4.1 `today_summary` returns `today_limit` and `waiting_for_slot` via `internal/closedlist`; verify `go test ./internal/agenttools/... ./internal/mcp/...`
- [ ] 4.2 `ot today` waiting section, `--all`, `--json` field, and `ot add --done` refusing `--repeat`/`--remind`; verify `go test ./internal/cli/...`

## 5. Docs, i18n, release notes

- [ ] 5.1 Strings in the six locales (en, de, fr, it, es, pt) for the groups, hint, actions, refusal, settings and chips; verify `npm test -- i18n` (catalog completeness)
- [ ] 5.2 Document the closed list, fill order, Take a slot, Done today and Log a win in `docs/today-and-upcoming.md`, the MCP fields in `docs/mcp.md` and the CLI flags in `docs/cli.md`; verify `make repo-check`
- [ ] 5.3 CHANGELOG entry under Unreleased at archive time; verify `make check` passes
