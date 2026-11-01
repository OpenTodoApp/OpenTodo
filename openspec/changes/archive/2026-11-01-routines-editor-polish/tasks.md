## 1. Words and lists

- [x] 1.1 Pick's mode word opens the anchored word list with a check on the chosen mode (`usecases.test.tsx` mode helper; story "Editor, comment with a value")
- [x] 1.2 Words have no minimum width and keep the line height on touch screens; chips sit against the following text (story "UI/Routine words"; layout check)
- [x] 1.3 A text word shows its whole text wrapped, values as chips, Show more over 280 characters (`usecases.test.tsx` "a text shows whole")
- [x] 1.4 "/" opens at the caret, "+ value" at its button, room made below; nearest value active (`usecases.test.tsx` "Escape keeps the text")
- [x] 1.5 The phone sheet repeats the edited text; its search field lines up with the rows (layout check, screenshots at 390 px)

## 2. Behaviour

- [x] 2.1 Escape keeps the typed text (`usecases.test.tsx` "Escape keeps the text")
- [x] 2.2 "needs a value here" waits until focus leaves the card or Save is pressed, and hides while typing (`usecases.test.tsx` "An empty input is not an error yet", "Save shows the errors")

## 3. Condition rows and wording

- [x] 3.1 Condition rows in one grid, no autofocus ring in the sheet, sticky Done (story "Condition rows"; screenshots)
- [x] 3.2 Condition summary names each date test once, six languages (`summary.test.ts`; `make i18n-check`)
- [x] 3.3 The name field's placeholder in the muted placeholder style

## 4. Checks

- [x] 4.1 `cd web && npm test && npm run build`, `make ui-lint`, `make i18n-check`, `make openspec-validate`, the layout check
