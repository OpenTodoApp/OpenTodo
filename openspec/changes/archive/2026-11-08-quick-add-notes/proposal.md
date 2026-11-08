# Quick add: a line that wraps, and notes under it

## Why

Quick add is one line. A long title scrolls sideways out of sight, which is hard to reread and edit, worst on a phone where moving the caret in a scrolled field is fiddly (#1034). And a task's notes can only be written after the task exists: someone who keeps a link in the notes, out of the task's title, has to add the task, open it and paste the link (#1035).

## What Changes

- **The line wraps.** Quick add's field wraps a long title onto more lines and grows with it up to five lines, then scrolls; it is never scrolled sideways. The title is still one line of text: Enter adds the task as before, and a line break that is pasted or dictated into it becomes a space. The marks beside the field (the `+`, the microphone, the shortcut hint) stay on its first line. The inline tints wrap with the text.
- **Notes under the line.** Shift+Enter in the line opens a notes field under it, with the caret there. Its text is saved as the new task's notes, as written, never parsed. Enter adds the task from there too, Shift+Enter is a line break in the notes, and Backspace in the empty field closes it and returns to the end of the line. The notes field grows to six lines, then scrolls. After the add both fields are empty and the notes field is closed.
- **A Notes tool on a phone.** The phone's sheet has no Shift+Enter, so its tool row gains a Notes tool that opens the notes field (pressed while it is open).
- Everywhere quick add appears (a list, a section's add row, a board column, the phone's sheet, a calendar day, the Review, the first-run guide) the line wraps and Shift+Enter opens the notes, except two places: the command bar's Add mode keeps Shift+Enter for "add and open", where the task's notes are one step away; and the share screen, which has its own Description field.

No setting: a single-line field has no advantage a person would choose (the issue's own reasoning). No new data: the notes are the task's existing `description`, written with the task in the same local operation.

## Capabilities

### Modified Capabilities

- `natural-language-capture`: a new requirement for the wrapping line and its notes; "Quick add tools on a phone" gains the Notes tool.

## Impact

- Web app: `web/src/app/QuickAdd.tsx` (the field is a `textarea`; Enter and Shift+Enter; the notes in the input), `web/src/app/QuickAddTint.tsx` (wraps, and sizes the field), `web/src/app/quickadd/NotesLine.tsx` (new: the notes field and its state), `web/src/app/quickadd/VoiceParts.tsx` (the microphone moved out of `QuickAdd` to keep it under the function size limit), `web/src/app/quickadd/SheetBar.tsx` (the Notes tool), `web/src/index.css` (the grid sizer), `web/src/lib/nlp/quickadd.ts` (`description` on the input), `web/src/lib/shortcuts.ts` (the Shift+Enter entry), `web/src/app/ShareCapture.tsx` (notes off), `web/src/app/task-list/useListBindings.ts` (moving into the notes keeps an `o` insertion), ref types from `HTMLInputElement` to `HTMLTextAreaElement`.
- Tests: `quickAdd.test.tsx`, `quickAddSheet.test.tsx`, and selectors in the tests that typed into the quick add.
- Docs: `docs/quick-add.md`, the keyboard guide (generated), a changelog fragment, visual baselines of the quick add stories.
- Out of scope: the inline title editor of a list row and the task page's title (the page already wraps); parsing anything in the notes; a setting for a single-line field; formatting tools in the notes field.
- Roadmap: quick-add polish after 1.0; it also serves "capture-first quick add" in the Gentle mode discussion (#1023), since details can be written while capturing.
