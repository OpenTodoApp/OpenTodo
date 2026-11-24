## 1. Rules and write

- [x] 1.1 `MethodRules.nextActionChoices`: the open top-level tasks but the next action, none blocked or delegated, with what the write must do (vitest `rules.test.ts`)
- [x] 1.2 `chooseNextActionUndoable` in `lib/undoActions.ts`: one undoable batch that clears a Someday or later start and, only when the next action comes before it, puts the task just above it in its section; toast "Next action for <project>" with Undo (vitest `chooseNextAction.test.tsx`)

## 2. Screens

- [x] 2.1 Place's field lists the project's open tasks while typing, ↓ lists them all, ↓ and Enter choose one, Enter alone adds, Esc closes (vitest `chooseNextAction.test.tsx`)
- [x] 2.2 The project walk's quick add offers the same choices; choosing one closes the dialog and the card shows it as the next action; typing a new step still creates it (vitest `chooseNextAction.test.tsx`)
- [x] 2.3 The reusable list's ticked suggestions are unchanged (vitest `reusableSuggest.test.tsx`)

## 3. Docs and check

- [x] 3.1 `docs/method/place.md` and `docs/review-and-statistics.md` describe choosing an open task; `make docs` and `make docs-check`
- [x] 3.2 Changelog fragment `changelog.d/Added/choose-next-action.md`
- [ ] 3.3 `npm test` and `npm run build` in web/, `make check`
