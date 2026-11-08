# Tasks

## 1. The field surface

- [x] 1.1 Add `.quick-add-surface` to `web/src/index.css` (`@layer components`, tokens only, a border under the high-contrast presentation); verify `make ui-lint` passes and the class shows a distinct fill in light and dark in the workbench
- [x] 1.2 Apply it to the `line` row in `web/src/app/QuickAdd.tsx` only (palette and sheet unchanged) and align the chips row under the text; verify `npm test` in `web/` (existing QuickAdd interaction tests unchanged) and a new test that `data-quick-add-layout="palette"` and `"sheet"` do not carry the class
- [x] 1.3 Drop `border-b border-default pb-2` from the quick add row in `web/src/app/TaskListView.tsx`, keeping the sticky classes; verify with a story or test that the row is sticky and opaque at 1280 px and that no divider remains
- [x] 1.4 Give `ReadOnlyQuickAdd` in `web/src/app/task-list/ListChrome.tsx` the same surface, dimmed; verify a test that the disabled field and its note render for a viewer

## 2. Visual checks

- [x] 2.1 Update the quick add and list stories (`web/src/app/quickAdd.stories.tsx`, `taskList.stories.tsx`) to show the field in light, dark and high contrast; verify `make ui-check` (accessibility and contrast gate) and regenerate baselines with `make ui-baselines`
- [x] 2.2 If `sunken` is too faint in dark, add a per-theme `--color-field` token and use it in the class; verify the contrast gate and the screenshots (decided: a resting `border-soft` hairline instead, see design.md decision 2)

## 3. Wrap up

- [x] 3.1 Add a "Quick add field" note to `docs/design-system.md` and a changelog fragment `changelog.d/Changed/quick-add-field-surface.md`; verify `node scripts/release/fragments.mjs` and `make repo-check`
- [ ] 3.2 Run `make openspec-validate`, `npm test` and `npm run build` in `web/`, `make bundle-budget`, then `make check`; verify all pass
