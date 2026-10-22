# Tasks

## 1. Measurements

- [ ] 1.1 M12 names the element that moved and by how much (`layoutShift` keeps the layout-shift sources, skipping the page itself); verify `node --test scripts/ux-audit/measure.test.mjs` ("M12 names what moved")
- [ ] 1.2 M15 watches a moment (`watchMotion` / `motionSeen`: `transitionrun` on moving properties and a per-frame poll of running animations); verify the fixture test "a short slide that ends before the snapshot is caught, a fade is not"
- [ ] 1.3 M7 counts a transparent absolutely positioned `::after` as the control's hit area; verify the fixture test "M7 counts a transparent ::after"
- [ ] 1.4 The tour's reduced-motion pass covers every overlay with an opener at 1280 px (mouse) and 360 px (touch), the Today completion (a different task per width) and drags on the board, the Plan and the Week; verify a run with `ONLY` set to the overlays, `today`, `board`, `plan`, `week` reports no NAV, and the same run with motion allowed (a temporary copy) reports the panel, sheets, toasts and drags moving
- [ ] 1.5 Strict mode includes M15 (`STRICT_RULES`); verify `node --test scripts/ux-audit/ux-audit.test.mjs` and the tour's header and message name reduced motion

## 2. Layout shift at its causes

- [ ] 2.1 Phone bar: the title column is one fixed height and the subtitle one line (`.phone-subtitle`), its controls keeping 44 px through `::after`; verify the probe shows no shift on Inbox and a project at 360 px and the budget test still finds `[data-phone-subtitle] [data-planned-line]`
- [ ] 2.2 Lists and projects: `useListModel` exposes `loading` and `projectsLoaded`; TaskListView shows the skeleton and no empty state, groups, Add section or Close the day until the tasks are read, and a project page waits for its project; verify list, project, board, timeline and columns report no M12 at 360, 768 and 1280 px, and `npm test` passes
- [ ] 2.3 Plan, Statistics, Projects, Updates, Display and the invite screen wait for their local reads (skeleton, footer with content, the checking card after 400 ms, fixed-width Updates filters); verify these screens report no M12
- [ ] 2.4 Sidebar groups wait for projects, labels, views, preferences and the collapse state of the current project list; verify the 768 px audit reports no shift of the sidebar's navs
- [ ] 2.5 Settings sections settle: `SettingsPendingGate` and `useSettingsPending` in the notifications, digest, calendar feeds, issues, webhooks, tokens, app passwords, backups and data cards, at most 600 ms; the Data page's sync badge on its own line; verify Notifications, Integrations and Data report no M12, and a test that a gate reveals after its cards answer, after 600 ms at most, and does not hide again

## 3. Docs and integration

- [ ] 3.1 Docs: `docs/design-system.md` (the audit's M15 moments, M12 naming the element, strict mode with M15), `docs/interface-guide.md` (the phone bar's one-line subtitle and the loading rule), CHANGELOG under Unreleased; verify `make docs-check`
- [ ] 3.2 Visual baselines for any story whose rendering changed (the phone bar), regenerated in the pinned Playwright image; verify `make ui-check` in CI
- [ ] 3.3 Run `make check` (TZ=UTC) and a narrowed `make ux-audit` over the eighteen M12 screens and the overlays; verify all pass and the report has no M12 and no M15
