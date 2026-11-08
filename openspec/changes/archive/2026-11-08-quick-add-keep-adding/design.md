# Design: keep adding from the phone's sheet

## D1. Stay open, no second button

The issue proposed a second send button ("add and keep adding") next to the arrow. A second button asks the user to choose on every task, and the common case is the one the command bar already answers: after Enter the box is ready for the next line. The sheet now does the same. Someone adding a single task closes the sheet with a tap above it, which is also how they would dismiss it today without sending; the list stays visible above the sheet, so the new row shows where it landed.

No setting: one behaviour across the command bar, the list's quick add and the sheet is simpler to learn than a preference.

## D2. Feedback

The field clears and keeps focus (the send button already cancels its mouse down, so the keyboard stays up). The new task appears in the list behind the sheet. For assistive technology a polite, visually hidden status reads "Added" after each add; its text is re-keyed per add so it is announced again for the next task.

## Interface budget

No chrome is added: the sheet keeps its field, chips and tool row. No new shortcut, no new scroll region, no row property.

## Data model

None. Each add is the same local `createTask` operation as before, offline included.

## Size

A few lines in one component; no dependency, no bundle change worth measuring.
