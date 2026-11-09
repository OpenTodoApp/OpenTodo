## 1. Print stylesheet

- [x] 1.1 `@media print` in `web/src/index.css`: colour tokens overridden to black on white, shell and controls hidden, scroll containers grown, rows drawn (`content-visibility: visible`), rows unsplit and headers kept with their first row, titles whole, 14 px root type; the phone row's rules limited to screens (checked with Playwright `emulateMedia({ media: 'print' })` and `page.pdf` on Today and a project with sections and subtasks, light and dark)

## 2. Print…

- [x] 2.1 `printItems`/`PrintMenuItem` in `web/src/app/menus/printItem.tsx`; Print… ends the page header's menu of the built-in views, the Inbox menu, the label menu, the project menu and a saved view's menu in the list layout (`web/src/app/printList.test.tsx`: the item calls `window.print` after the menu closed and is left out in a native shell; `web/src/app/sampleTasks.test.tsx`: the Inbox menu stays for Print…)
- [x] 2.2 The interface icon `printer` (`web/src/ui/icons/names.json`, `node scripts/icons-sync.mjs`); "Print…" in every catalog (`make i18n-check`)

## 3. Docs and checks

- [x] 3.1 Docs: `docs/print-a-list.md` with its image; changelog fragment `changelog.d/Added/print-lists.md`; `make docs`
- [x] 3.2 `npm run typecheck`, `npm run lint`, the touched web tests, `make ui-lint`, `make bundle-budget`, `make openspec-validate`, `make i18n-check`, `make docs-check`
