# Tasks

## 1. Tokens and reduced-motion rules

- [ ] 1.1 Add `--duration-moment: 400ms` and `--ease-spring: cubic-bezier(0.22, 1, 0.36, 1)` to `web/src/index.css` with their `@theme inline` utilities, unless `tokens-v2` has already landed them (then assert they exist); verify with a unit test in `web/src/ui/tokens/` that each token is defined exactly once and that no declared duration in `index.css` exceeds 400 ms (`npm test`)
- [ ] 1.2 Extend the reduced-motion and `data-motion="none"` blocks so every new keyframe (`row-strike`, `row-collapse`, `row-rolled`, `dialog-enter`, `dialog-exit`, `toast-enter`, the view-transition pseudo-elements) falls back to opacity or to nothing; verify with `npm test` (the existing contrast and motion token tests) and the gate in 5.2
- [ ] 1.3 Update `docs/design-system.md` Motion row and the Tokens table (three durations, the spring ease, what reduced motion and no motion keep) and the Design workbench paragraph; verify with `make docs-check`

## 2. List reflow helper

- [ ] 2.1 Write `withListTransition(affectedRowIds, update)` in `web/src/app/motion.ts` with the gates of design D4 (API present, reduced motion, no-motion attribute, cap of 40, local only, no focused text field, document visible, skip a running transition) and record the verified browser support table in design.md; verify with a happy-dom test that stubs `document.startViewTransition` and asserts each gate takes the direct path (`npm test -- motion`)
- [ ] 2.2 Name rows and headers for the transition only while it runs (`view-transition-name` set in the update callback on rendered rows, cleared on `finished`) and add the `::view-transition-*` rules to `index.css`; verify with a test that after a transition no element keeps a `view-transition-name` and that at most 40 rows were named when 200 are affected
- [ ] 2.3 Route the local list actions through the helper: complete, reschedule, drag and drop in `TaskListView` and `BoardView`, bulk actions, Undo, the sidebar drop (`listActions.ts`, `listDrop.ts`, `sidebarDrop`); leave the sync applier and the importer on the direct path; verify with `npm test` (listActions, listDrop, sidebarDrop suites extended with a "transition requested" spy) and that the sync test suite shows no transition call

## 3. The completion sequence

- [ ] 3.1 Make `toggle` in `TaskRow.tsx` write at once and record the id in the departing set; add the departing-row rendering to `TaskListView` and `BoardView` (last row model, `data-departing`, done state, `aria-hidden`, `inert`, removed after the moment) and the `data-rolled` path for repeating tasks and habits; verify with happy-dom tests in `taskRow.test.tsx` and a new `departing.test.tsx`: the op is in the database before any timer fires, three fast completions write three ops in order and the cursor advances each time, a departing row is skipped by `x` and by the drop position, a repeating task's row stays with the next date
- [ ] 3.2 Add the CSS sequence (`row-strike`, `row-collapse`, the stacked date crossfade, the brief tint) on `data-departing` and `data-rolled` per the timing table in design D3, and the haptic tick call at the start; verify with the motion story (5.1) and the gate (5.2), and with `npm run build` that the main bundle grows by at most 2 KB gzipped
- [ ] 3.3 Make Undo cancel a departure: `undoToast` and the `Ctrl+Z` path drop the id from the departing set before the batch restores, and the restored row fades in over 120 ms; verify with `undo.test.tsx` cases at 50, 200 and 450 ms after completion, offline included (the reopening op queues after the completion)
- [ ] 3.4 Give the Undo toast its entrance and exit (`toast-enter`, opacity exit) in `Toasts.tsx` and `UndoToast.tsx`, keeping the five-second single-completion and ten-second bulk durations; verify with `npm test -- undo` and the overlay story
- [ ] 3.5 Update `docs/interface-guide.md` (rule 10 names the completion sequence and the departing row; the row section gains `data-departing`) and `docs/tasks-and-projects.md` (completing a task, Undo); verify with `make docs-check`

## 4. Overlay motion and haptics preference

- [ ] 4.1 Add `dialog-enter` and `dialog-exit` to `Dialog.tsx` from 640 px with a `closing` state that unmounts on `animationend` or after 300 ms, move the phone sheet to the emphasis duration with a matching exit, and keep menus, popovers, tooltips and the palette on the 120 ms fade with instant close; verify with `dialog.test.tsx` and `dialogSheet.test.tsx` (focus returns to the trigger before the exit ends; a dialog closed twice quickly unmounts once) and `overlay.test.ts`
- [ ] 4.2 Slide the task panel in `PanelHost.tsx` only on the closed → open edge and never when the shown task changes; verify with a happy-dom test that opening another task while open sets no entrance class, and the Shell story
- [ ] 4.3 Add `user_prefs.haptics` to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; the `tick()` helper in `motion.ts` reading it; completion and the calendar long-press calling `tick()`; verify with `go test ./internal/sync/...` (schema accepts `on`/`off`, refuses other values) and a vitest that `navigator.vibrate` is called once on completion with the preference on and never with it off or when absent
- [ ] 4.4 Add the Haptic feedback `SettingRow` to `AppearanceSection.tsx`, shown only when `'vibrate' in navigator`, with copy in `settingsCopy.ts` and the five translations; verify with `appearanceSettings` tests (hidden without vibrate, writes the preference with it), `node scripts/i18n-check.mjs`, and `docs/settings-app.md` updated (`make docs-check`)

## 5. Workbench and gate

- [ ] 5.1 Create `web/src/ui/foundations/Motion.stories.tsx` (Completion, Repeating completion, Reflow, Dialog, Sheet, Panel, Toast, each with a Play control over seeded rows) and remove the Motion section from `Layout.stories.tsx`; verify with `npm run build-storybook` and the accessibility gate on the new stories (`node scripts/ui-check/a11y.mjs` with `ONLY` set to them)
- [ ] 5.2 Write `scripts/ui-check/motion.mjs` (reduced motion emulated: fail on any running animation touching transform, translate, scale, height, block-size, width or inline-size; `data-motion="none"`: fail on any animation) and add it to the `ui-check` target in the `Makefile`; verify by temporarily adding a 200 ms slide to a toast without a reduced-motion rule and watching the check fail naming the story and property, then removing it
- [ ] 5.3 Regenerate the row, board, dialog and toast baselines at rest under `web/src/ui/__screenshots__/` with the UI baselines workflow or `make ui-baselines` (Docker); verify `make ui-check` passes in light and dark at 375 and 1280 px
- [ ] 5.4 After `calm-rows` archives, add the haptics row to appearance-preferences "Appearance in Settings" in `openspec/specs/` and reconcile this change's delta; verify with `make openspec-validate`

## 6. Integration

- [ ] 6.1 Add a ROADMAP.md row under "Next: Design refresh" for the motion step and the CHANGELOG.md entry under Unreleased (the completion moment, rows that make room, overlay motion, the haptics switch, what reduced motion keeps); verify by review and `make docs-check`
- [ ] 6.2 Measure the completion moment and a 40-row reflow on the audit tour's throttled phone profile (`make ux-audit` from `ux-audit-three-widths`, or a Playwright script with 4× CPU throttling) and record the wall time in design.md; if a moment exceeds 400 ms, lower the cap to the viewport's rows and re-measure
- [ ] 6.3 Run `make check` and `make layout-check` and fix anything they report; verify both pass
