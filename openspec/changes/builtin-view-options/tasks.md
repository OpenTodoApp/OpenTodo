# Tasks

Before applying: `upcoming-drag` is archived (its deltas are the base of this change's `manual-ordering` and `upcoming-start-with-today` deltas).

## 1. Preferences

- [ ] 1.1 Add the thirteen `user_prefs` string fields of design D1 to `internal/sync/ops.go` `Schema` (default `""`, a comment each, not `Content`). Regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`, and record the new op schema entries with `go test ./internal/httpapi -run TestV1SurfaceIsAdditive -update`. Verified by `go test ./...`.
- [ ] 1.2 `web/src/lib/listDisplay.ts`: `DisplayScope.kind` gains `today`, `upcoming` and `inbox`, with a per-kind table of group choices, order choices, defaults and field prefix. `ListDisplay` gains an optional `subtasks`. `listDisplayOf` reads a built-in view from the `user_prefs` row and falls back per field on empty, unknown or not-offered values without writing. Verified by `web/src/lib/listDisplay.test.ts`: every default, `section` on Today reads as Time of day, an unknown value reads as the default, and no op is queued.
- [ ] 1.3 `setListDisplay` writes a built-in view's changed fields to `user_prefs` `me`, one op per field. `resetListDisplay(scope)` writes `""` to that view's non-empty fields only. Verified by `web/src/lib/listDisplay.test.ts` (the outbox holds only the changed fields, and a reset of Today leaves the Inbox fields alone).

## 2. Groups and order

- [ ] 2.1 `web/src/lib/listGroups.ts`, Today: the chosen grouping replaces only the day groups (design D3). Earlier, Blocked, Waiting for a slot and Done today keep their place and fold state. The chosen order applies within Earlier, the chosen groups and Blocked. Waiting keeps fill order and Done today stays newest first. Project-grouped rows leave out the project. Part chips show outside Time of day. Only Time of day's headings carry `dropPart`. Verified by `web/src/lib/listGroups.test.ts` (the "Today by project", "Order inside Earlier" and "Slots do not move" scenarios).
- [ ] 2.2 Default equivalence: with every option empty, `listGroups` returns the same groups and row order as before for Today, Upcoming (with and without Start with Today) and the Inbox. Verified by a snapshot test in `web/src/lib/listGroups.test.ts` over the existing Today, closed-list and day-parts fixtures.
- [ ] 2.3 Upcoming: the chosen order sorts each day. With Start with Today, the lead groups are built with Today's display (design D4). Verified by `web/src/lib/listGroups.test.ts` ("Upcoming by priority" and "Today grouped by project" with Start with Today), and `web/src/app/upcomingDrag.test.tsx` still passing.
- [ ] 2.4 Inbox: grouping by Due date, Priority or Label and the chosen order use the project branch (design D6). Subtasks stay under their top-level task in manual order. Verified by `web/src/lib/listGroups.test.ts` ("Inbox by priority").
- [ ] 2.5 Nest subtasks on Today and Upcoming: each group goes through `buildTaskTree`. The chosen order sorts top-level nodes, children keep manual order, and a parent in another group leaves the child flat with its breadcrumb (design D5). Verified by `web/src/lib/listGroups.test.ts` (the four "Nest subtasks" scenarios) and by `siblingPositions` giving levels for nested rows.
- [ ] 2.6 Incremental updates: a task write under each non-default option keeps unchanged row objects (`keepGroups`), and the 10,000-task Today stays within its budget. Verified by `web/src/lib/listGroups.test.ts` and `web/src/app/scale10k.perf.test.tsx` with Today grouped by project.

## 3. Panel, page and keys

- [ ] 3.1 `web/src/app/views/DisplayPanel.tsx`: leave out Group by when `groupOptions` is empty, show a "Nest subtasks" `Switch` when the value carries `subtasks`, and show a "Reset" button below More options when given `onReset`, moving focus to the first control after it. Verified by `web/src/app/views/viewsAndDisplay.test.tsx` (Upcoming shows no Group by, the Inbox shows no switch, Reset hidden at defaults, focus after Reset) and a Storybook story per view (`make ui-check`).
- [ ] 3.2 `web/src/app/task-list/useListModel.ts` and `useListDisplay.tsx`: Today, Upcoming and the Inbox get a `DisplayScope`, the panel in `ListPageActions`' `extra` and the phone bar's `extraSlot`, the row layout from their own choice, and, for the Inbox, `onReorder` switching back to Manual order. Today passes all field definitions for custom-field orders, and the Inbox passes none. Verified by `web/src/app/taskListView.test.tsx` (button present on the three views, an Alt+Down in the Inbox under a title order writes `inbox_sort_by: position` before the move) and `web/src/app/budget.test.tsx` unchanged.
- [ ] 3.3 Keys: register `arrange.group-time` (`r g t`, "Time of day") in `web/src/lib/shortcuts.ts`. `useDisplayKeys` runs on the three views with their choices. Verified by the registry conflict test, and by `web/src/app/displayKeys.test.tsx` (`r g p` then `r g t` on Today with their notices, `r g p` doing nothing on Upcoming, `r o m` doing nothing on Today).
- [ ] 3.4 Strings ("Time of day", "Nest subtasks", "Reset") in every catalogue. Verified by `make i18n-check`.

## 4. Docs

- [ ] 4.1 `docs/built-in-views.md`, `docs/today-and-upcoming.md`, `docs/upcoming-with-today.md` and `docs/today-limit.md`: what each view offers, what stays fixed, Reset, and that a saved view is still the way to list other tasks. Regenerate the keyboard guide and roadmap with `make docs`. Verified by `make docs-check`.
- [ ] 4.2 Changelog fragment `changelog.d/Added/builtin-view-options.md` citing #872, #1089 and #1108. Verified by `make repo-check`.

## 5. Integration

- [ ] 5.1 `go test ./...` passes.
- [ ] 5.2 `npm test` and `npm run build` in `web/` pass, and `make bundle-budget` passes without raising `web/bundle-budget.json`.
- [ ] 5.3 `make check` passes. On a smoke server (`./bin/opentodo`), Today grouped by project, Upcoming ordered by priority and the Inbox grouped by label sync to a second browser, and Reset returns each to its default.
