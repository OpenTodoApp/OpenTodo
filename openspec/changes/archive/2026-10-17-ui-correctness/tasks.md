# Tasks

Frontend tasks are verified with `npm test` (vitest) and `npm run build` in `web/`, plus `make ui-lint` and `make i18n-check`.

## 1. Lookups and roles

- [x] 1.1 Data attributes for the title, sidebar project rows and the Add menu; verify with `task-detail/languageSelectors.test.tsx` ("Vim i focuses the title in German", "… when its name holds quotes") and `uiCorrectness.test.tsx` "moving through the list leaves a focused sidebar project in German".
- [x] 1.2 Writable checks on skip, this occurrence only, schedule and estimate; verify with `uiCorrectness.test.tsx` "skip, this occurrence only, schedule and estimate change nothing and open nothing".

## 2. Dates

- [x] 2.1 `useToday()` in TaskListView and Sidebar; verify with `uiCorrectness.test.tsx` "Today and the sidebar count take in the new day".

## 3. Dialogs

- [x] 3.1 `ConfirmDialog` for invite revocation, ownership transfer, leaving, undoing an import and the two-factor policy; verify with the four `uiCorrectness.test.tsx` "confirmations use the app dialog" tests.
- [x] 3.2 `LinkDialog` and an asynchronous link command; verify with `task-detail/notes.test.tsx` "Ctrl+K asks for the address in the app dialog …" and `richtextEditor.test.ts` "applies an answer that arrives later …".

## 4. Text and colour

- [x] 4.1 `t()` for the Logbook note and the estimate placeholder, translations in de, es, fr, it, pt; verify with `uiCorrectness.test.tsx` "counts a day's completions in the interface language" and `make i18n-check`.
- [x] 4.2 Untranslated check for phrases and shown keys; verify with `scripts/i18n/untranslated.test.mjs` "a phrase without a two-letter word and a template under a shown key fail".
- [x] 4.3 Border token in the calendar grid and colour functions in the token lint; verify with `ui/tokens/lint.test.ts` "finds literal colour functions as well as hex" and "screens in src/app use tokens instead of raw colours".

## 5. Silent failures

- [x] 5.1 `act()` for the remaining list actions; verify with `npm test` and `npm run lint`.
