# Proposal

## Why

From the phone feedback collected in GitHub issue [#1477](https://github.com/OpenTodoApp/OpenTodo/issues/1477): a bullet list can become a checklist, but a checklist cannot become a bullet list again. **Bullet list** (the formatting row, the `/` menu, `Ctrl+Shift+8`) wraps the selection in a new list, so inside a checklist it nests a list instead of taking the checkboxes away; the only way back was to retype the lines.

## What Changes

- **Bullet list on a checklist takes its checkboxes away**, for every item of the list around the caret, and keeps the text, the order and any nested list. A checked item loses its tick with its box.
- Anywhere else Bullet list does what it did: it wraps the selection in a bullet list.

Out of scope: a numbered list to a bullet list and back, and Checklist as a toggle.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: a requirement that Bullet list turns a checklist back into a bullet list.

## Impact

- `web/src/lib/richtextEditor.ts` (`wrapInBulletList`, the `Mod-Shift-8` key), `web/src/app/editorCommands.ts` (the command), `web/src/lib/richtextEditor.test.ts`, `docs/formatting-row.md`.
- The stored note is the same Markdown a bullet list always was (`- text`). No new string, op, route, setting or dependency.
