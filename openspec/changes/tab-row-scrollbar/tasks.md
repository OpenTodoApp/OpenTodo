# Tasks

## 1. The tab row without vertical overflow

- [x] 1.1 In `web/src/ui/Tabs.tsx`, replace the row's `border-b border-default` with a 1 px inset bottom shadow in the border token, add `overflow-y-hidden` and `forced-colors:border-b`, and remove `-mb-px` from the tabs (design D1–D3). Verify: in Storybook (`make storybook`), `Surfaces/Tabs` and `Task/Panel` show no scrollbar beside the tab row in Chrome, and the selected underline is 2 px on the baseline.
- [x] 1.2 Extend the `Tabs` tests in `web/src/ui/surfaces.test.tsx`:
  - the row has `overflow-x-auto` and `overflow-y-hidden`, and no plain `border-b`;
  - no tab has a negative bottom margin;
  - the existing group and keyboard tests still pass.

  Verify: `cd web && npm test -- surfaces`.
- [x] 1.3 Check the three callers in a running app (`make dev`): the task panel's conversation tabs, sticky and scrolled into a long thread; the project view's tabs; the workspaces settings tabs. Each has a visible baseline, no vertical scrollbar, and unchanged height. Do this at 1280 px and at 360 px, where the row scrolls sideways and the selected tab stays in view. Verify: by eye, plus `cd web && npm run build`.

## 2. A check that keeps it fixed

- [x] 2.1 Add `tabRowOverflow()` to `scripts/ux-audit/measure.mjs`: zero tolerance, it reports every `[role="tablist"]` with `scrollHeight > clientHeight` or a computed `overflow-y` other than `hidden` (design D4). Call it in `scripts/e2e-layout.mjs` next to `verticalScrollers` for screens and overlays. Verify: on a checkout of `main` before 1.1 the layout check fails, naming the task panel's tab row; after 1.1 it passes (`make layout-check`).
- [ ] 2.2 Update the visual baselines that moved, if any (`make ui-baselines` locally, or the CI artifact flow), after inspecting each diff. Verify: `make ui-check` passes, and every changed baseline shows only the tab row.

## 3. Release

- [x] 3.1 Add a CHANGELOG.md entry under Unreleased ("Tab rows no longer show a stray vertical scrollbar", Fixes #445). Verify: `npm run docs:check`.
- [ ] 3.2 Run `make check` and `make openspec-validate`. Verify: both pass.
- [ ] 3.3 After the PR is merged, reply on issue #445 with a short, friendly note: what caused the scrollbar, what changed, and which release it lands in. Then close the issue. Verify: `gh issue view 445 -R OpenTodoApp/OpenTodo` shows the comment and the state CLOSED.
