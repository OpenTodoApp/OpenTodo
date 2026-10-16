# Tasks

Frontend tasks are verified with `npm test` and `npm run build` in `web/` unless another command is named. Each group leaves `make check` green.

## 1. Group state and headers

- [x] 1.1 Give `SidebarGroup` a `count` shown on the heading while collapsed and make the heading sticky inside the scroller (`position: sticky`, canvas surface, actions kept); verify with `ui/patterns/patterns.test.tsx` (count rendered only while closed) and an updated `UI/Patterns/Sidebar` story whose baseline shows a stuck header.
- [x] 1.2 Make Filters, Projects and Labels all `collapsible` with per-device state `ot.sidebar.group.<id>` (default open, try/catch like `ot.sidebar.more`) and pass each group's item count; verify with `sidebar.test.tsx`: collapsing Filters hides its rows, reads "Filters 6", survives a remount, and the header's All and add actions still work while collapsed.
- [ ] 1.3 Update the `Screens/Sidebar` stories (a collapsed group, a stuck header at 1280) and regenerate their baselines; verify with `make ui-check`.

## 2. Tree defaults and bulk toggles

- [x] 2.1 Add `collapsedProjects.initialised` and `readCollapsed(projects)` to `web/src/lib/projects.ts` so a device without a stored state reads every parent as collapsed, and materialise the set on the first write (toggle, `expandAncestorsOf`, bulk); verify with a unit test in `web/src/lib` covering: nothing stored → all parents collapsed; one toggle → only that parent changes; an existing stored array is respected.
- [x] 2.2 Add "Collapse all" and "Expand all" to the Projects header menu and wire them to the bulk writes; verify with `sidebar.test.tsx` (Collapse all leaves eleven root rows with subtree counts, Expand all restores thirty, navigating to a nested project from the palette expands only its ancestors).
- [x] 2.3 Update `docs/projects.md` ("Sub-projects": roots collapsed on a new device, Collapse all and Expand all) and `docs/getting-started.md` (the sidebar paragraph); verify with `npm run docs:check`.

## 3. Find in the sidebar

- [x] 3.1 Add `web/src/lib/sidebarFind.ts` with `matchSidebar(query, { rows, labels, views })` built on the Combobox match helpers; verify with `sidebarFind.test.ts`: accent-insensitive match, ancestors returned for a nested match, empty query returns everything, no match returns empty groups.
- [x] 3.2 Render the find field at the top of the scroller (opened by a search action on the Projects header), filter the three groups through `matchSidebar` without writing group or project state, force matching ancestors open, hide groups without matches, and handle Enter (open first match), Up/Down (move), Escape (clear, close, focus the opener); verify with `sidebar.test.tsx` covering the four scenarios of "Find in the sidebar" in the app-shell delta, including the collapsed Labels group restored after Escape.
- [x] 3.3 Register `go.find` (`g /`, global, outside text fields; expands the icon rail first) in `web/src/lib/shortcuts.ts` and add the palette command "Find in the sidebar"; verify with the registry conflict test, `palette.test.tsx` (the command opens the field) and `make docs` regenerating `docs/keyboard.md` without a diff in other rows.
- [ ] 3.4 Verify the drawer flow at 390 px: opening the field from the drawer and choosing a match closes the drawer and opens the destination; verify with `shell.test.tsx` and the layout check (`ENGINES=chromium make layout-check`) staying within three scrollers.

## 4. Integration

- [ ] 4.1 Run `make check` and confirm `budget.test.tsx` still reports five primary items and at most three scrollers with the find field open; verify with the command's output.
- [ ] 4.2 Run `npx @fission-ai/openspec validate --all --strict`; verify it passes.

## Workflow follow-up

- Archive the change after review and add a CHANGELOG.md entry under Unreleased.
