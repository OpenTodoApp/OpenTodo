# Tasks

## 1. Preconditions and menu infrastructure

- [x] 1.1 Confirm that `design-language` and `ui-primitives` are merged. The 12-hue palette tokens, `Icon` (with `more-horizontal`, `pencil`, `palette`, `pin`, `home`, `arrow-up`, `arrow-down`, `folder-input`, `merge`, `archive`, `trash-2`, `grip-vertical`), icon-only `Button`, `MenuItem`/`MenuGroup`/`MenuSeparator` with menu semantics on `overlay/Menu`, `Combobox`, `Badge` and `EmptyState` must import from `web/src/ui/`. Add any missing icon through the `ui-primitives` icon process. Verify with `cd web && npm run typecheck`.
- [x] 1.2 Add `web/src/app/menus/ActionMenu.tsx`. It renders `ActionGroup[]` (item kinds `action`, `check`, `picker`, `confirm`; disabled items with a reason; danger tone) through the `ui-primitives` menu components inside `overlay/Menu`. Verify with a vitest component test: groups render in order with separators, danger items come last, disabled items expose their reason as the accessible description, and a `check` item reports `aria-checked`.
- [x] 1.3 Implement the in-overlay picker step. A `picker` item swaps the menu content for a `Combobox` with a back button. The first Escape returns to the items, the second closes the menu. Verify with a vitest test covering both Escape presses and the "invalid targets are never listed" filter.
- [x] 1.4 Add `useConfirm()`, which builds an `overlay/Dialog` with `role="alertdialog"` and `dismissable={false}` from `{ title, body, confirmLabel, tone }`, starts with focus on Cancel, and returns focus to the menu trigger afterwards. Verify with a vitest test: Escape and Cancel resolve false with no side effect, and the confirm button label equals the action verb.
- [x] 1.5 Make triggers row-aware. Add `.group:focus-within .hover-reveal` and `.group[data-active] .hover-reveal` (a data attribute, since `aria-selected` is not allowed on a plain row and axe flags it) to `web/src/index.css` (in the existing utilities layer), and make the trigger an icon-only `Button` that keeps today's accessible names ("Menu for label …", "Menu for view …", "Section menu for …", "Project menu"). Verify with a vitest test that the trigger keeps its name, and by manually tabbing onto a sidebar label row in `make dev` and seeing its trigger appear.
- [x] 1.6 Add `useRowMenuShortcut`: `.`, Shift+F10 and the ContextMenu key on a focused row open that row's menu, and do nothing inside text fields. Verify with a vitest test for each key and for the text-field guard. Add the shortcut to the `?` help overlay and to `docs/keyboard.md`, and confirm with `cd web && npm run docs:check`.
- [x] 1.7 Run `cd web && npm test && npm run build`. Both pass.

## 2. View menu

- [x] 2.1 Replace the body of `ViewMenu` in `web/src/app/ViewsView.tsx` with a `useViewMenu(view)` groups hook:
  - Rename
  - check "Pinned to sidebar", check "Start view on this device"
  - Move up / Move down, disabled at the edges with a reason
  - Delete view (`confirm`, saying tasks are not affected)

  Keep the shared NamePrompt for rename. Verify with a vitest unit test on the hook output: order, checked states, edge-disabled reasons.
- [x] 2.2 Check that the sidebar (`Sidebar.tsx:233`), views overview, view header (`SavedViewView.tsx:127`) and dashboard (`DashboardView.tsx:104`) all render the same menu. Verify with a vitest test that renders `ViewMenu` from two call sites and compares item lists. Check by hand that pin, start view and delete still work offline (DevTools offline in `make dev`).
- [x] 2.3 Remove the native `confirm()` from `ViewsView.tsx`. Verify that `grep -n "confirm(" web/src/app/ViewsView.tsx` returns nothing, and that the existing `web/src/lib/views.test.ts` still passes.
- [x] 2.4 Update `docs/views.md` for the new menu items and confirmation. Verify with `cd web && npm run docs:check`.

## 3. Section and project menus

- [x] 3.1 Rebuild the section menu in `web/src/app/Sections.tsx` with `useSectionMenu`: Rename; Move before/after, disabled with a reason at the edges; Delete section, confirmed with the number of open tasks that move to "No section". Remove its `confirm()`. Verify with a vitest test that the dialog shows the open-task count and that Cancel leaves the section and its tasks unchanged (fake-indexeddb). `web/src/app/boardView.test.tsx` must still pass.
- [x] 3.2 Rebuild the project menu in `web/src/app/ProjectHeader.tsx` with `useProjectMenu`. The colour swatches stay as the first group, with radio semantics. "Move to" becomes a `picker` item over the existing valid-target list (itself, descendants, archived and deleted excluded; "Top level" offered), showing each candidate's parent path. The `m` shortcut opens straight into the picker step. Then Rename, Archive, and Delete project (confirm with open tasks and sub-projects counted). Remove the native `<select>` and `confirm()`. Verify with vitest tests: descendants are never listed, typing "mark" lists only matching projects with their path, and confirming a move writes one op (the existing move tests in `web/src/lib/` still pass).
- [x] 3.3 Update `docs/sections-and-boards.md` and `docs/tasks-and-projects.md` (the Move to and delete flows). Verify with `cd web && npm run docs:check`.

## 4. Labels: data helpers

- [x] 4.1 Rebuild `reorderLabel` in `web/src/lib/labels.ts` on `lib/ordering.ts` (`planStep` for -1/+1/top/bottom, `planMove` for before/after), written with one `mutateMany()`. Add `moveLabelTo(id, placement)`. Verify in `web/src/lib/labels.test.ts` that an ordinary step queues exactly one label op, that equal positions trigger a minimal renumber, and that the result orders identically under the shared position-then-id rule.
- [x] 4.2 Add `labelUsage(id)`, counting non-deleted tasks whose `labels` include the id (the same set `deleteLabel` rewrites). Verify with a labels.test.ts case where completed and trashed tasks are counted or excluded exactly like `deleteLabel`.
- [x] 4.3 Switch the label swatches to the 12-hue palette solid values from `design-language`. Keep `LABEL_PALETTE` as an alias, so `createLabel`'s "first unused colour" still works. Mark a stored non-palette hex as its nearest hue without rewriting it. Verify with a labels.test.ts case: an unknown stored hex maps to a hue, and no op is queued by opening the panel.
- [x] 4.4 Run `cd web && npm test`. Passes.

## 5. Labels: menu, edit panel and page

- [x] 5.1 Build `useLabelMenu(label)`: Edit…, Rename (F2), Move up / Move down (Alt+↑/↓), Merge into… (`picker` over every other non-deleted label), Delete (`confirm` with `labelUsage`). Merge goes picker → confirmation naming both labels and the task count → `mergeLabels` → navigate to the target. Remove both `confirm()` calls and the native `<select>` from `LabelsView.tsx`. Verify with vitest tests: the merge picker never lists the source, the delete dialog shows the usage count, and Cancel queues no op.
- [x] 5.2 Build the label edit panel (Popover, or a sheet below 640 px). Appearance: name field with inline validation (empty or duplicate name refused, old name kept) and the swatch `radiogroup` (arrow keys, current marked). Organize: move actions with shortcut hints. Danger zone: Merge into…, Delete label…. Changes apply immediately as single label ops. Verify with vitest tests: picking a swatch queues one op, a duplicate name shows the inline error and queues none, and the swatches are at least 44×44 px under the coarse-pointer rule.
- [x] 5.3 Rebuild `LabelRow` and `LabelsView`:
  - rows with a drag handle, colour chip, name, open count, `Badge` for duplicates and the row-aware trigger
  - inline rename on double-click and F2
  - Alt+↑/↓ and Alt+Shift+↑/↓ reorder that keeps focus on the row, with a polite live-region announcement
  - an `EmptyState` with a "New label" action and the `L` hint
  - a duplicate banner with a "Merge…" action that opens the merge confirmation for the pair, with a swap control

  Verify with vitest tests for F2 rename, Alt+Up reorder (one op, focus kept), the empty state, and the banner's merge flow.
- [x] 5.4 Add pointer drag-reorder to the overview and to the sidebar Labels group, following the `listDrop.ts` pattern: drop indicator, auto-scroll, handle-only long press on touch, via `moveLabelTo`. Verify with a vitest test of the drop-target computation. Also check by hand in `make dev`, on desktop and in a phone-sized responsive view: drag works, and scrolling the list on touch doesn't start a drag. (Checked with Playwright: mouse drag on the overview and the sidebar; on an emulated Pixel 7 with real touch events, a swipe on the list scrolls without reordering, a quick move from the handle does not drag, and a long-press on the handle then a drag reorders.)
- [x] 5.5 Check offline and convergence by hand. In `make dev` with two browser profiles, take one offline, then rename, recolour, reorder and merge there. Reconnect, and both profiles show the same names, colours, order and counts.
- [x] 5.6 Update `docs/labels-and-filters.md` (overview, edit panel, rename, reorder, merge, delete, shortcuts). Verify with `cd web && npm run docs:check`.

## 6. Layout check, screenshots and integration

- [x] 6.1 Update the overlays in `scripts/e2e-layout.mjs`: `label-menu`, `view-menu`, `sidebar-view-menu`, `view-header-menu`, `section-menu` and `project-menu` (new item names such as "Pinned to sidebar"). Add overlays for `label-edit`, `label-merge-picker`, `project-move-picker` and a destructive `confirm-dialog`. Verify that `make layout-check` passes at 360, 390 and 768 px in light and dark, in Chromium and WebKit.
- [x] 6.2 Check that no native `confirm()` or `<select>` remains in the four menus: `grep -nE "confirm\(|<select" web/src/app/LabelsView.tsx web/src/app/ViewsView.tsx web/src/app/Sections.tsx web/src/app/ProjectHeader.tsx` returns nothing.
- [x] 6.3 Measure the gzipped bundle before and after (`cd web && npm run build`, compare the `dist/assets` sizes) and record the number in design.md under "Size and runtime impact".
- [x] 6.4 Regenerate the affected user-guide screenshots with `make docs-screenshots`, and verify that the labels, views and project images show the new menus in both themes.
- [x] 6.5 Run `npx @fission-ai/openspec validate labels-and-menus --strict` and `make check`. Both pass.

## Workflow follow-up

- Archive with `/opsx:archive` after review, then confirm that `npx @fission-ai/openspec validate --all --strict` passes and add a CHANGELOG.md entry under Unreleased.
- Add `labels-and-menus` to the ROADMAP.md "Design refresh" entry created by `design-language` when it ships.
