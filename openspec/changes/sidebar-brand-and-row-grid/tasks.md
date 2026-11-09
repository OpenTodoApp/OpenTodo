# Tasks

## 1. Sidebar

- [ ] 1.1 `WorkspaceControl` shows the workspace picture (icon on colour, else initial on colour, else initial on the raised surface) and its name on one line, and the rail shows the picture. Verify with tests for the three "Workspace picture" scenarios and updated sidebar story baselines; run `npm test` in web/.
- [ ] 1.2 `SidebarBrandLine` under the footer row: mark, name and version, the link to Settings › About, the `NewsDot` for unread news, the branded logo and name, the mark alone on the rail, and the end of the phone drawer. Verify with tests for "Unbranded", "Branded" and "Unread news", the `instance-branding` scenarios, and the layout check at 360 and 1280 px.
- [ ] 1.3 Update The three columns in `docs/interface-guide.md` and update `docs/workspaces.md`. Verify with `make docs-check`.

## 2. Row grid

- [ ] 2.1 The slot order and widths as list-level properties, the "no row uses it" rule computed from the list's rows, `first baseline` alignment, and the same widths in both densities (`index.css` "The property column", `TaskRow.tsx`). Verify by updating the row tests for every One row anatomy scenario, including "Slots line up when values are missing", "A slot no row uses" and "Compact density keeps the slots".
- [ ] 2.2 The marks at 12 px on the title's first baseline in one-line and detailed rows. Verify with "Marks on the title's baseline" and the row story baselines in light, dark, 375 and 1280 px (`make ui-check`).
- [ ] 2.3 The part of the day's icon in the time column, with "evening" leaving the date words. Verify with "Evening in the column" and the existing Time column and Metadata language tests updated.
- [ ] 2.4 Update Rows and chips in `docs/interface-guide.md` and `docs/design-system.md`. Verify with `make docs-check`.

## 3. Task panel

- [ ] 3.1 Panel proportions: the checkbox centred on the title's first line, the title one step smaller, 32 px rows (44 px on coarse pointers). Verify with "Two-line title" and "Touch" and the panel story baselines.
- [ ] 3.2 The `fit` mode of `ui/Tabs.tsx` (icons with counts when narrow), used by `ConversationTabs`. Verify with "A narrow panel" at 22 rem and the existing Task panel tabs tests; the design-system tab-row tests still pass.
- [ ] 3.3 The quiet subtask checklist. Verify with "Heading and items" and "Tick offline".
- [ ] 3.4 The compact estimate editor. Verify with "Preset", "Arrow keys" and a range-refusal test.
- [ ] 3.5 Update `docs/task-panel.md`. Verify with `make docs-check`.

## 4. Calm Upcoming

- [ ] 4.1 Add `user_prefs.upcoming_later` to `internal/sync/ops.go` `Schema` with its comment, and regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`. Verify with `go test ./...`.
- [ ] 4.2 Later days in Upcoming's display panel; summary bars for days after the first three with tasks, open in place, keys and drop. Verify with tests for every Calm Upcoming scenario and "Upcoming has no grouping"; run `npm test` in web/.
- [ ] 4.3 Update `docs/today-and-upcoming.md`. Verify with `make docs-check`.

## 5. Checks

- [ ] 5.1 Add `changelog.d/Changed/sidebar-brand-and-row-grid.md`, and confirm the first load stays within `web/bundle-budget.json` or is raised on purpose with its reason. Verify with `npm run build` in web/ and `make bundle-budget`.
- [ ] 5.2 `make openspec-validate` and `make check` pass.
