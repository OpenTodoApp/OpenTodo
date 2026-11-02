## Context

The routine editor's words and pickers (routines-dynamic-data D13) live in `web/src/app/routines/` (`pickers.tsx`, `wordPicker.tsx`, `StepCard.tsx`, `words.tsx`) over `web/src/ui` (`WordButton`, `DataChip`, `Popover`, `ComboboxPanel`). The condition rows are `ConditionFields` in `web/src/app/rules/RuleFields.tsx`, shared with the rule dialog and the When card.

## Decisions

### D1. Escape keeps the text
Escape in a text word commits it, like Enter and blur. The value list catches the first Escape (it closes and focus returns to the field), so the second Escape leaves the field with the text kept. Undo (Ctrl+Z) still takes the edit back as one step. Discarding was the only way to lose typed text silently; keeping is the reversible choice.

### D2. Lists open at the caret or the button, below when they fit
"/" places the list at the caret: a hidden copy of the field's text up to the caret gives its position, and a one-pixel anchor sits there. "+ value" anchors at its button's end edge. Before opening, a field too close to the bottom of the window is scrolled up so the list fits below it (to the top on phones, so the field stays above the sheet); the sheet also repeats the text with the caret at its top. The list's options become active on pointer movement, not on enter, so a list opening under a resting pointer keeps its first, nearest value active.

### D3. Words are inline targets
The touch rule gives every button a 44 px minimum width and height. A word is a target inside a sentence, the WCAG 2.5.8 inline exception: it keeps 44 px of height on touch screens (with a negative vertical margin so the line does not open up) and drops the minimum width; the layout check skips it through `data-touch-exempt="inline"`. A label chip's remove button keeps its icon size with a 44 px transparent hit area around it (`data-touch-exempt="hit-area"`).

### D4. When "needs a value here" shows
Only a `missing_input` error waits: it shows once focus has left its step's card (not into one of its own pickers), or after Save was pressed, and it is hidden while that input's text is being typed. Type errors, removed references and the save message show as before. Test stays disabled while any error exists.

### D5. Condition rows as a grid
Two columns, names in the first (2 fr) and controls in the second (3 fr) at full width, so every select has one width at 390 and 1280 px. The label fields show their name in the first column and keep it for assistive technology only in their own legend. The bottom sheet focuses its content wrapper instead of the first control, and Done sits in a sticky footer.

## Data model, size and budgets

No data model change, no new dependency, no new route. Bundle size is unchanged within noise (a few hundred bytes in the lazily loaded routines chunk). The editor keeps its chrome and scroll regions; no new shortcut.
