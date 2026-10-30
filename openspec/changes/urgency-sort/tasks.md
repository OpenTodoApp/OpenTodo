## 0. Prerequisite

- [ ] 0.1 Confirm `custom-field-sort` (PR #549) is merged and archived, so the sort-value helper, the "without a value last" comparator and the tie chain exist on `main`; `openspec list` shows no `custom-field-sort` in flight. If not, stop and ask the owner.

## 1. The score

- [ ] 1.1 `web/src/lib/urgency.vectors.json`: cases for every component, both ramp clamps and the interior, a zoned due across midnight, the day start, half rounding, completed and deleted blockers, p4 with nothing (0.00), parked and blocked (−11.00), and the 22.96 example
- [ ] 1.2 `web/src/lib/urgency.ts`: `urgency(task, ctx)` returning `{score, parts}`; `urgency.test.ts` runs the vectors; `npm test` passes
- [ ] 1.3 `internal/urgency/urgency.go` with the same table; `urgency_test.go` runs the same vectors file; `go test ./internal/urgency/...` passes
- [ ] 1.4 A test fails when the two sides disagree (change one weight locally, see both vector tests catch it, revert)

## 2. Order in the web app

- [ ] 2.1 `urgency` added to the sort-value helper and comparator from `custom-field-sort` (`web/src/lib/listDisplay.ts`, `listGroups.ts`), descending default, tie chain unchanged; unit tests in `listDisplay.test.ts` for projects, labels and views, subtasks under parents, Later and Completed last
- [ ] 2.2 `DisplayPanel.tsx`: Urgency after Title, before custom fields; choosing it sets direction to descending; `viewsAndDisplay.test.tsx` and `listDisplayPanel.test.tsx` cover it
- [ ] 2.3 Score chip in `TaskRow`'s trailing group only under urgency order and from 640 px, Tooltip on hover, Popover on Enter/Space, Escape returns focus; touch menu "Why here?" with a bottom sheet below 640 px; happy-dom test `urgencyChip.test.tsx`
- [ ] 2.4 Live re-ordering when a blocker completes after sync (test with two fake devices in `urgencyChip.test.tsx` or the list model test)
- [ ] 2.5 Older-client behaviour: a stored unknown order still reads as default (existing "Unknown value" test extended with `urgency` on a build without the feature flag path, or kept as a comment pointing to the existing test)
- [ ] 2.6 Strings ("Urgency", "Why here?", the component labels) in the six catalogs; `make i18n-check`
- [ ] 2.7 Story for a list ordered by urgency with the chip and the open popover, light and dark, 375 and 1280 px; `make ui-lint` and `make ui-check`

## 3. Server, tools, CLI

- [ ] 3.1 `internal/httpapi/views.go`: `urgency` in `viewSortBy`; `views_test.go` covers 200 on create/patch, 400 for `"urgent"`, 401 without credentials; `go test ./internal/httpapi/...`
- [ ] 3.2 `internal/agenttools/read.go` `list_tasks`: `sort` argument, ordering, `urgency` and `urgency_parts` in results, invalid-argument error; tests in `agenttools_test.go`; MCP tool listing snapshot updated
- [ ] 3.3 `internal/cli`: `ot list --sort urgency` (and the aliases), score column and `--json` field, exit 2 on an unknown value; `cli_test.go`; regenerate the command schema and completion
- [ ] 3.4 `go test ./...`

## 4. Docs and checks

- [ ] 4.1 `docs/group-and-order.md`: the Urgency order, the weight table, the breakdown, and a pointer to custom-field orders for WSJF-style scores
- [ ] 4.2 `docs/api.md` (`sort_by: urgency`, `list_tasks` `sort`), `docs/cli.md` (`--sort urgency`), generated help (`web/src/generated/help.json`); `make docs-check`
- [ ] 4.3 CHANGELOG Unreleased "Added" (at archive time)
- [ ] 4.4 `cd web && npm test && npm run build`; `make check`; `make openspec-validate`
