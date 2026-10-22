# Tasks

## 1. Measures

- [ ] 1.1 M11 compares only controls of one layer (the page, or one open menu, dialog, sheet, list of options or tooltip) in `scripts/ux-audit/audit-measures.mjs`; add the open-menu case to the M11 fixture test; verify `node --test scripts/ux-audit/measure.test.mjs` passes
- [ ] 1.2 M12 records each moved element's share of the shift and names the top three instead of "page"; verify the fixture test passes and a rerun names the moved elements

## 2. Target size (M7, design D1)

- [ ] 2.1 Task row: the completion button, the collapse toggle, the title button and the selection label reach 24 px on a fine pointer without changing the row's layout (`web/src/app/TaskRow.tsx`)
- [ ] 2.2 Sidebar: the project chevron (24 px), the group-header actions and the Add menu trigger (`SIDEBAR_GROUP_ACTION`, at least 24 × 24 px) in `web/src/app/Sidebar.tsx` and `web/src/ui/patterns/Sidebar.tsx`
- [ ] 2.3 Project header: the members button and the Public badge at least 24 px tall; the panel's completion button 24 px on a fine pointer; quick-add token suggestions 44 px on touch
- [ ] 2.4 Verify on a rerun of the core screens that the row, sidebar, project-header and quick-add M7 findings are gone

## 3. Cut text (M10, design D2)

- [ ] 3.1 `TruncatedText` in `web/src/ui` (measured with a ResizeObserver; while cut: Tooltip and a tab stop with the token ring) and a `disabled` prop on `Tooltip`; tests in `web/src/ui/tooltip.test.tsx`, a story in `UI/Tooltip`
- [ ] 3.2 Use it for the row's project name, the desktop page title, the phone bar's title and subtitle, the Trash titles, the share dialog's member lines, the Week day headers, the field column cells and the account email in Settings; the Inbox's planned line cuts itself as a control
- [ ] 3.3 Loop home's pulse tiles wrap their labels instead of cutting them (German)
- [ ] 3.4 Verify on a rerun that the M10 findings of these screens are gone

## 4. Focus rings (M8, design D3)

- [ ] 4.1 Add `focus-visible:outline-solid` wherever `outline-none` cancels a `focus-visible:outline-N` ring (18 class lists, `index.css` included)
- [ ] 4.2 Style lint `cancelledRings` with its test in `web/src/ui/tokens/lint.test.ts`
- [ ] 4.3 Rings for the panel's title field and Add subtask field and for the sidebar's resize edge
- [ ] 4.4 Empty `scripts/ux-audit/focus-exempt.json`; verify the workbench focus pass on every `Screens/*` story passes without exemptions

## 5. Overlap (M11, design D4)

- [ ] 5.1 The row's trailing group keeps the width of the revealed actions (7 rem) on a fine pointer from 768 px, also when it has nothing else to show
- [ ] 5.2 The sidebar's chevron slot (36 px) and the All projects page's (44 px) widen on touch, so the 44 px chevron reaches at most 4 px under its destination
- [ ] 5.3 Verify on a rerun that the row-actions and chevron M11 findings are gone

## 6. Layout shift (M12, design D5)

- [ ] 6.1 The list page shows nothing until its tasks (and a project page's project) are read (`loaded` in `useListModel`)
- [ ] 6.2 The project header's meta row is one 24 px row from the start; on a phone the project's subtitle is plain text
- [ ] 6.3 The phone bar's subtitle stays on one line
- [ ] 6.4 Statistics draws its panels once the tasks and the device's date changes are read
- [ ] 6.5 Verify on a rerun that M12 is gone from the list, project, board, timeline, columns and statistics screens

## 7. Issue editor

- [ ] 7.1 The disabled Test button's reason shows in the dialog and describes the button; the native `title` and its `tooltip-lint-allow` marker go

## 8. Integration

- [ ] 8.1 `docs/design-system.md` (TruncatedText, the ring lint, the empty exemption list) and the CHANGELOG entry under Unreleased
- [ ] 8.2 Regenerate the visual baselines of the changed stories in the pinned Playwright image
- [ ] 8.3 `make check` (TZ=UTC), the workbench gate (`node scripts/ui-check/a11y.mjs` on the Screens stories) and a rerun of the core screens with `make ux-audit`; record the before and after figures here
- [ ] 8.4 Open the pull request and get CI green
