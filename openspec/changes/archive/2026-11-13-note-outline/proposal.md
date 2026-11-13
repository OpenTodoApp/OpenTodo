# Proposal

## Why

Long notes (a project brief, meeting minutes kept for a year, a trip plan) are hard to move around in: the only way to reach a section is to scroll and read. The headings people already write are a table of contents nobody can use.

## What Changes

- **Outline.** A note with 3 or more headings shows its outline: the headings in order, indented by level, the current one marked as the reader scrolls. Choosing a heading scrolls the note to it and puts the caret at its start when the note is editable.
- **Where:** as a narrow column beside the note when the note is wide enough (a standalone note on the Notes page or its own page, the task page) and as an **Outline** button in the note's top corner otherwise (the docked task panel, project notes, phones), opening a menu of the headings.
- Keys: `Ctrl+Shift+O` (`⌘+Shift+O` on a Mac) while a note has focus moves focus to the outline; ↑ and ↓ move, Enter goes to the heading, Esc returns to the note.
- Works for task notes, project notes and standalone notes, offline and on encrypted accounts; nothing is stored.

No new op field, entity, route, dependency or mandatory environment variable. Not **BREAKING**.

Out of scope: reordering sections by dragging headings; folding sections; an outline in the Notes list or the graph; headings inside tables or quotes.

Roadmap: the "Notes area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: the outline of a note's headings, where it is shown, and its keys.

## Impact

- Web: a small `web/src/app/editor/NoteOutline.tsx` (column and menu, the `Menu` primitive), heading extraction from the editor state, `web/src/lib/shortcuts.ts` (`editor.outline`); catalogs, stories.
- Docs: `docs/notes-and-subtasks.md` (Write notes), `docs/notes.md`, `docs/keyboard.md` (generated).
- Size: under 1 KB gzip in the editor chunk; first load unchanged.
