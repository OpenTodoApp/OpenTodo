## 1. Plans and undoable actions

- [x] 1.1 `planDeleteSection`, `planTaskToSection` (`lib/sections.ts`), `planDeleteLabel`, `planMergeLabels` (`lib/labels.ts`, one batch instead of one write per task), `planTaskMove`, `planTaskStep` (`lib/move.ts`); the plain writes use them. `deleteSectionUndoable`, `deleteLabelUndoable`, `mergeLabelsUndoable`, `deleteFieldUndoable`, `moveTaskUndoable`, `moveTaskByUndoable`, `sectionMoveUndoable` in `lib/undoActions.ts`; `completeUndoable` ends the running time entry in its batch. Verify: `npx vitest run src/lib/undoCoverage.test.ts src/lib/labels.test.ts src/lib/fields.test.ts src/lib/undoActions.test.ts src/lib/timeEntries.test.ts`

## 2. Surfaces

- [x] 2.1 Ticking through `completeWithUndo` in the Filter view, saved views, the dashboard, `useListKeys`, the weekly review, the Daily check, the monthly look and the method lists. Verify: `npx vitest run src/app/undoCoverage.test.tsx` (the tick test, and the source check fails before the change)
- [x] 2.2 `moveRowWithUndo`, `stepRowWithUndo`, `sectionMoveWithUndo` (`app/undoable.ts`) in `useListDrag`, `useBoardMoves`, the section picker (`Facets`), `useListShortcuts`, `TaskListView`'s Move items, Vim and `subtaskOrder`. Verify: `npx vitest run src/app/undoCoverage.test.tsx` (board column move test)
- [x] 2.3 Section, label and field deletion and label merge through `withUndoToast` in `Sections`, the command palette, `LabelsView` and `FieldsDialog`; the four new strings in every catalog. Verify: `node scripts/i18n-check.mjs`, `npx vitest run src/app/undoCoverage.test.tsx`

## 3. Checks

- [x] 3.1 Related web tests, typecheck, lint, bundle budget, `make docs`. Verify: `npm run typecheck`, `npm run lint` in `web/`, `make web && make bundle-budget`, `make docs-check`
