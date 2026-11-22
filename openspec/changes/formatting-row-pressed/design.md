# Design

## D1. One reader of the selection, told by the editor

`formattingAt(state)` in `richtextEditor.ts` reads the selection: a mark counts on a non-empty selection only when every text node in it has the mark (plain and bold text selected together is not bold), and on an empty selection when it is in the stored marks or the marks at the caret. The list is the nearest list item's: a bullet list's item with `checked` null is Bullet list, one with a boolean is Checklist; a numbered list presses neither.

The row learns of changes through a plugin in the shared plugin list whose view `update` calls the listeners `onViewUpdate(view, fn)` registered for that view. This covers both editors that show the row (notes and the comment composer) without either one's `dispatchTransaction` knowing about the row, and a programmatic selection as much as a tap. The row subscribes only while it is shown.

## D2. The pressed look

The look of the Formatting toggle's pressed state (`bg-selected`, `text-strong`), so one pressed look exists for the editor's buttons.
