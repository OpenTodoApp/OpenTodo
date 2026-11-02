## 1. Rows

- [x] 1.1 The title clamps at two lines in every row shape, the marks sit on its first line, the phone row keeps one line (`web/src/app/TaskRow.tsx`, `web/src/index.css`); verified by `web/src/app/taskRow.test.tsx` "title width" and the layout check at 768, 1024 and 1280 px
- [x] 1.2 The trailing group keeps no room for the revealed actions (`web/src/app/TaskRow.tsx`); verified by `taskRow.test.tsx` and by the hover height measured in the repro script (unchanged on hover at 768 to 1600 px)
- [x] 1.3 The property column and the source line on the title's first line, the 48 rem measure (`web/src/index.css`); verified by the stories `Screens/Task row` LongTitle and LongTitleNarrow
- [x] 1.4 `useOverflowing` and the tooltip on a cut title (`web/src/ui/useOverflowing.ts`, `web/src/app/TaskRow.tsx`); verified by `taskRow.test.tsx` "names the whole title in a tip only while it is cut" and `npm test` in web/

## 2. Inbox pane

- [x] 2.1 `SPLIT_EMPTY_QUERY` and the gate in `PanelHost` (`web/src/app/panel.ts`, `web/src/app/PanelHost.tsx`); verified by `web/src/app/inboxSplit.test.tsx` "between 1024 and 1440 px the pane is there only while a task is under the cursor"

## 3. Checks and docs

- [x] 3.1 Stories and visual baselines (`make ui-baselines`), `make ui-lint`, `npm run build` in web/
- [x] 3.2 Docs and CHANGELOG (`docs/` Inbox guide), `make docs-check`, `make openspec-validate`
