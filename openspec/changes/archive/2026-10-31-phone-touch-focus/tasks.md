## 1. Checkbox touch target (#636)

- [x] 1.1 `web/src/app/TaskRow.tsx`: the checkbox slot is stacked above the row on a coarse pointer (`pointer-coarse:z-1`); measured at 390 px in Chromium with touch emulation on the Phone and Task list stories (a tap 8 px right of the circle hit the open control while the title was moving, and hits the circle's button now)
- [x] 1.2 `scripts/ux-audit/measure.mjs` `rowCheckReach`, run by `scripts/e2e-layout.mjs` on every screen (layout check job)

## 2. Focus by touch (#641)

- [x] 2.1 `web/src/lib/focusEdit.ts`: `pressFocus`, `placeFocus`, `estimateAndPlace`, `readFocusContext`, one batch with Undo for Three tasks and Bento; the Daily check's `f` uses it (`app/review/bento.test.tsx`, `rhythms.test.tsx` pass unchanged)
- [x] 2.2 `web/src/app/focus/focusRequest.tsx` (menu state and item, picker host in the shell), `focusActions.ts` and `FocusPicker.tsx` (lazy): candidates today first, fitting estimates first; `touchFocus.test.tsx` "Picker candidates"
- [x] 2.3 Empty Bento slot button and the Three tasks Add to focus row in the Daily check, Add to focus on the Loop home; `touchFocus.test.tsx` "Empty slot by touch", "Three tasks by touch"
- [x] 2.4 Add to focus / Put in a slot / Remove from focus in the Actions menu (`BulkActions`), the task panel and page (`TaskActionsMenu`) and the Focus screen; `touchFocus.test.tsx` "Task menu" (add and remove with Undo, full, Bento slot menu, viewer) and "Actions menu"; `focusView.test.tsx` menu labels
- [x] 2.5 Strings in the six catalogues; `make i18n-check`

## 3. Stories, docs, checks

- [x] 3.1 Stories "Daily check · Three tasks with room" and "Focus picker · Large slot"; baselines of the new stories and the Bento Daily check stories
- [x] 3.2 `docs/method/rhythms.md` (Pick the focus by touch, Bento), `docs/focus.md`; `make docs-check`
- [x] 3.3 `web/bundle-budget.json` raised to 716 KB with the reason; `make bundle-budget`
- [x] 3.4 `cd web && npm test && npm run build`, `make ui-lint`, `make openspec-validate`
