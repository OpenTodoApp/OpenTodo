# Proposal

## Why

From the phone feedback collected in GitHub issue [#1477](https://github.com/OpenTodoApp/OpenTodo/issues/1477): "how to indent and outdent list items in the app". The editor nests a list line with <kbd>Tab</kbd> and brings it back with <kbd>Shift</kbd>+<kbd>Tab</kbd>, and a phone has neither, so a nested list could not be made or undone on a phone.

## What Changes

- **Indent and Outdent are editor commands**, in the formatting row's **More** menu and the `/` menu, doing what <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> do in a list: Indent nests the line under the one above, Outdent moves it one level out (out of the list from the top level).
- They are offered only where they can act: Indent on a list line that has a line above it in the same list, Outdent on any list line.

Out of scope: indent buttons in the formatting row itself (it keeps its five), and indenting paragraphs outside lists.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: a requirement for Indent and Outdent as commands.

## Impact

- `web/src/app/editorCommands.ts` (two commands on `sinkListItem` and `liftListItem`, the functions Tab and Shift-Tab already use), `web/src/app/editorListIndent.test.ts`, `docs/formatting-row.md`, and two strings, "Indent" and "Outdent", in every locale.
- No op, route, setting or dependency.
