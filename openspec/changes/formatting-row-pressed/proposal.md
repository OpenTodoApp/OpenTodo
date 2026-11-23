# Proposal

## Why

From the phone feedback collected in GitHub issue [#1477](https://github.com/OpenTodoApp/OpenTodo/issues/1477): the formatting row does not show which formatting is on. In bold text, Bold looks the same as anywhere else, so the only way to know is to look at the text, and a tap on Bold with nothing selected (bold for what is typed next) gives no sign at all.

## What Changes

- **Bold, Italic, Link, Bullet list and Checklist in the formatting row show as pressed** while their formatting applies at the selection: a mark on all of the selected text, or stored at the caret, and the list the caret's item is in (Bullet list for a plain item, Checklist for an item with a checkbox). The row reads it again after every change of the editor, a moved caret as much as an edit.
- Each of those controls carries `aria-pressed`, so a screen reader says "Bold, on".

Out of scope: a row that stays at the top while a long note scrolls (also asked in #1477); the row sits in the note's scroller on surfaces of different colours, so it is its own decision.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: a requirement that the formatting row shows which formatting is on.

## Impact

- `web/src/lib/richtextEditor.ts` (`formattingAt`, `onViewUpdate` and a plugin that calls its listeners), `web/src/app/EditorChrome.tsx` (`aria-pressed` on the row's controls), `web/src/index.css` (the pressed look, as the Formatting toggle's), tests, `docs/formatting-row.md`.
- The same row in the comment composer gets it too. No new string, op, route, setting or dependency.
