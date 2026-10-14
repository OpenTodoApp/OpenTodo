# Tasks

## 1. Shared list logic and routes (design D2, D3)

- [ ] 1.1 Extract the Today, Upcoming and project filters and the Today and Upcoming groupings from `web/src/app/TaskListView.tsx:116-131` and `:219-236` into pure functions in `web/src/lib/dayLists.ts`, and make `TaskListView` call them. Verify with unit tests (overdue, today, next-day columns for `days=3`, completed-today list, archived projects excluded) and the existing list tests, `npm test` in web/.
- [ ] 1.2 Add the `display` route and `DisplayOptions` parsing and serialisation to `web/src/app/router.ts` (`eink=1` expansion, unknown values to defaults, `routePath` round-trip). Verify with router tests for each path and option combination, `npm test` in web/.

## 2. Tokens for high contrast and no motion (design D4)

- [ ] 2.1 Add the `[data-contrast="high"]` override (light and dark) and the `[data-motion="none"]` rules to `web/src/index.css`, and the override pairs to `web/src/ui/tokens/pairs.ts` with a 7:1 text threshold. Verify with `contrast.test.ts` passing for the override in both modes and the token lint, `npm test` in web/.
- [ ] 2.2 Add a Foundations story showing the override in the workbench and document it in `docs/design-system.md`. Verify with `make ui-check` and `make docs-check`.

## 3. The display screen (design D3, D4, D5)

- [ ] 3.1 Build `web/src/app/display/DisplayScreen.tsx`, `Clock.tsx` and `DisplayColumn.tsx`: clock and date in the user's formats, Today (overdue, today, completed today, next-day columns), Upcoming, project by section and saved view through `runView`; `--display-scale` per size; root attributes set on mount and removed on unmount; midnight rollover; "Last synced" line from the sync snapshot; wake lock when available; screen id `display`. Verify with component tests for each target, the midnight rollover (fake timers), the attributes leaving on unmount, and an axe check; `npm run build`.
- [ ] 3.2 Render `DisplayScreen` instead of `Shell` on display routes in `web/src/app/App.tsx` (after the unlock screen, sync running, sign-in screen when anonymous, "no longer exists" for unknown ids). Verify with an App-level test showing sync starts on a display route and that an anonymous visitor sees sign-in and then the display.
- [ ] 3.3 Implement roving focus, arrows, `j`/`k`, Home, End, Escape, Space and Enter, and the `canEditTask` rule for checkboxes (viewer role shows none). Verify with keyboard tests (move and toggle on own data, nothing on a viewer's project, `g` `s` inert) and a test that a toggle offline queues an op in the outbox, `npm test` in web/.
- [ ] 3.4 Add the display to the layout check at 360, 390 and 768 px in light and dark, including `contrast=high` and `size=xl`. Verify with `make layout-check`.

## 4. Entry points and start view (design D6)

- [ ] 4.1 Add "Display mode" to the Today and Upcoming header area, `ProjectHeader`'s menu and the saved view menu, and the Exit control with "Make this the start view on this device". Verify with component tests that each entry navigates to the right route and that Exit returns to the normal view.
- [ ] 4.2 Extend `StartView` with `display:` values in `web/src/lib/views.ts` (`resolveStartView` validates ids and falls back to the Inbox with the notice) and list "Display: Today" and "Display: Upcoming" in Settings → Preferences → Start view. Verify with unit tests for resolution and fallback and the settings component test, `npm test` in web/.
- [ ] 4.3 Document display mode in `docs/views.md` (new section "Display mode", `display-mode` in `specs:`), the tablet and e-ink set-up in `docs/install-app.md` (viewer account for shared screens, kiosk mode, `OPENTODO_SESSION_DAYS`, supported browsers), the start view option in `docs/settings.md`, and regenerate `docs/keyboard.md` and the help bundle. Verify with `make docs` (no diff on a second run) and `make docs-check` (the new capability is covered).

## 5. Public link display (design D7; needs `public-links`)

- [ ] 5.1 Make `PublicListScreen` read `display=1` and the options, render through `DisplayColumn` with the clock and the public notice, and keep polling. Verify with a component test for `display=1&eink=1` (attributes, clock without seconds, notice present) and one for the plain page unchanged; add the variant to the layout check.
- [ ] 5.2 Add one paragraph to `docs/sharing.md` on showing a public link on a display. Verify with `make docs-check`.

## 6. Integration

- [ ] 6.1 Manual smoke on `make dev`: open `/display/today?eink=1` on a tablet-sized window, complete a task from a second browser and see it move to the completed list, toggle a task with Space, sign in as a viewer account on a shared project and confirm no checkboxes, set the display as the start view and reload. Record the result in the change folder notes.
- [ ] 6.2 Run `make check` (lint, Go and web tests, UI lint, docs check, OpenSpec validation). Verify it passes.

## Workflow follow-up

- Add a ROADMAP.md row under "3. Organisation, views and GTD": "Display mode for tablets and e-ink panels | `display-mode`" and remove row 14 from "Next: Parity and depth".
- Add a CHANGELOG.md entry under Unreleased (Added: display mode; high-contrast and no-motion presentation).
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
