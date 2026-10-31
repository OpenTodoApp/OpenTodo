# A Formatting toggle for notes on a computer

## Why

The note editor has a full formatting row (`EditorToolbar` in `web/src/app/EditorChrome.tsx`: bold, italic, link, bullet list, checklist and a More menu), but it is shown only on touch screens while the note has focus. On a computer, formatting a task's or a project's note means knowing the shortcuts, the Markdown input rules or the slash menu. The comment composer already solved this with a small **Formatting** toggle (`web/src/app/task-detail/Composer.tsx`, `rich-comments` D3) that shows the same row on a fine pointer; the note editor, where people write the most, has nothing. The owner decided (DECISIONS.md, "Notes feature", 2026-10-31): the note editor gets the same small toggle on desktop, its state is remembered, and a setting turns the toggle off entirely for people who never want it.

## What Changes

- **Toggle beside the note.** On a fine pointer, every editable note (task page, docked panel, project note, and later standalone notes) shows a small **Formatting** toggle (the bold icon, like the composer's) at the top end corner of the note. It appears while the pointer is over the note or focus is in it, and always while it is pressed; it is always in the Tab order, just before the note's text.
- **The row.** While pressed, the existing formatting row is shown above the note, inside the panel's or page's own scroller, whether or not the note has focus. Pressing it again hides the row. Buttons in the row keep the note's selection.
- **Remembered per device.** Whether the row is shown is remembered on the device, separately for notes and for the comment composer, so a person who likes it in notes need not see it in comments.
- **Comment composer.** Its existing toggle behaves the same: its state is now remembered on the device, and it follows the setting below.
- **Setting.** Settings › Account › Profile › How you work gains a **Formatting button** switch (on by default), a synced preference `user_prefs.formatting_toggle`. Turned off, the toggle is not shown in notes or in the composer on a computer and the row is never shown there; shortcuts, input rules and the slash menu keep working. Touch screens are unaffected: their row still appears while the editor has focus.
- **Keyboard and screen readers.** The toggle is a button named "Formatting" with its pressed state announced. The row is a toolbar named "Formatting" that is one Tab stop and moves between its controls with the arrow keys, Home and End; Escape returns focus to the note. No new keyboard shortcut.

Not **BREAKING**: one additive preference, no route, no new environment variable.

## Out of scope

- New formatting commands or a different row (the row is the existing `EditorToolbar`).
- A floating "bubble" toolbar on selection.
- Changing the touch-screen row.
- A keyboard shortcut for the toggle (the slash menu and shortcuts already reach every command).

## Roadmap

Advances milestone 0.19 "Series and time", item `notes-toolbar-desktop` (third of the notes changes). GitHub issue: [#654](https://github.com/OpenTodoApp/OpenTodo/issues/654).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: ADDED "Formatting toggle on computers" and "Formatting button setting"; MODIFIED "Editing toolbar on touch screens" (the row is also shown on a fine pointer through the toggle, and becomes a toolbar with arrow-key movement).
- `comments`: MODIFIED "Composer behaviour" (the composer's toggle is remembered on the device and follows the setting).

## Impact

- **Web:** `web/src/app/EditorChrome.tsx` (the row as a roving-focus toolbar; a shared `FormattingToggle`), `web/src/app/NotesEditor.tsx` (the toggle and the row on a fine pointer), `web/src/app/task-detail/Composer.tsx` (remembered state, setting), `web/src/app/method/HowYouWorkSection.tsx` and `web/src/lib/settingsCopy.ts` (the switch), `web/src/lib/types.ts`; strings in six languages; stories for the toggle and the row.
- **Data model:** `user_prefs.formatting_toggle` (string, additive) in `internal/sync/ops.go` `Schema`, regenerated `web/src/generated/opSchema.ts` and the contract fixture.
- **Server, API, CLI, MCP:** none beyond the preference passing through sync and export.
- **Size:** no dependency. The toggle and row live in the lazily loaded editor chunk; first-load growth under 0.3 KB gzip (the preference read and the settings row are on lazy pages).
