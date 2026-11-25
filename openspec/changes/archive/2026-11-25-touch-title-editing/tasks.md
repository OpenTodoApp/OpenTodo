## 1. Touch title editing

- [x] 1.1 The short left swipe edits on touch at any width: `swipeEditTitle` no longer depends on 768 px. Verify: `touchTitleEdit.test.tsx` "a short left swipe edits the title" at 390 and 1024 px (`npm test -- touchTitleEdit` in web/).
- [x] 1.2 `enterKeyHint="done"` on the compact field, and Return saves. Verify: `touchTitleEdit.test.tsx` checks the attribute and "Return saves and ends the edit".
- [x] 1.3 A tap outside saves and does nothing else; a scroll keeps the editor; Cancel discards; a subtask edits like its parent. Verify: `touchTitleEdit.test.tsx` (tap on another row, scroll, Cancel, subtask) and `rowSwipe.test.ts` "swallowClick".
- [x] 1.4 The compact editor stays above the keyboard with its Save and Cancel. Verify: `visualViewport.test.ts` "keeps the whole touch title editor above the keyboard".

## 2. Docs and checks

- [x] 2.1 `docs/task-panel.md` and `changelog.d/Changed/touch-title-editing.md`. Verify: `make docs` and `make docs-check`.
- [x] 2.2 `npm test` and `npm run build` in web/, `npm run lint`, `make bundle-budget`, `make i18n-check`, `make openspec-validate`.
