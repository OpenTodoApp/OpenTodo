# Proposal

## Why

GitHub issue [#1529](https://github.com/OpenTodoApp/OpenTodo/issues/1529): in the iOS app and the iOS home-screen web app, a tap on a link in a task's notes puts the notes into editing (the caret and the keyboard) instead of opening the link. The editor opens a link only on Ctrl or Cmd and a click, which a phone cannot do, and a long press is taken by iOS for its own text menu. A link in a note could not be opened on a phone at all.

## What Changes

- **On a touch screen a tap on a link opens it.** A short tap that stays on one link opens a web or mail address in a new tab (in the apps the shell sends it to the system browser, as every external link) and a link to a note, task or project in the app, as Ctrl-click does with a mouse. The caret does not move there and the keyboard stays down.
- **What is not a tap keeps the editor's rules:** a finger that moves (a scroll, a selection) or stays down (a long press), two fingers, and every mouse, pen and keyboard input. A tap on text that is not a link still starts editing.

Out of scope: turning a bare address typed as text into a link, editing a link's text by touch (the link dialog, the toolbar and Markdown source do that), and read-only notes, where a link already opens.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: a requirement for opening links by touch.

## Impact

- `web/src/lib/linkTap.ts` (new, the tap rule), `web/src/app/NotesEditor.tsx` (the editor's touch handlers), `web/src/app/task-detail/noteLinkTap.test.tsx`, `docs/note-links.md`.
- Opens only what the editor already renders as a link: `safeHref` (http, https, mailto) and the app's own `?note=`, `?task=`, `?project=` addresses. No new string, op, route, setting or dependency; the shells are unchanged.
