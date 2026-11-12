# Proposal

## Why

Notes are edited as rich text and stored as Markdown, but the Markdown itself is never shown. People who think in Markdown, who paste text from another app, or who need to fix a list the input rules turned into something else have no way to see and edit the source. Flatnotes and most note apps offer a source mode; ours is one toggle away from the projection we already keep.

## What Changes

- **Markdown source.** Every note the user may edit (task notes, project notes, standalone notes) can be switched to its Markdown source: the note's projection shown as plain monospace text in the same place, edited as text, and switched back to rich text.
- Reached with `Ctrl+Shift+M` (`⌘+Shift+M` on a Mac) while the note has focus, a **Markdown** entry in the slash menu, and a **Markdown** button beside the Formatting toggle on computers. The choice holds until the note is closed; it is not stored.
- **Edits stay mergeable.** Source edits are applied to the note's document as block-level changes at each pause: only the blocks whose text changed are replaced, so mentions, images and blocks nobody touched keep their nodes, and concurrent edits on other devices merge as rich-text edits do. Remote edits appear in the source text without moving the caret.
- Read-only notes show their source read-only.

No new op field, entity, route, dependency or mandatory environment variable. Not **BREAKING**.

Out of scope: a split preview beside the source; syntax highlighting beyond monospace; a per-device "always open in source" preference; source mode in the comment composer.

Roadmap: the "Notes area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: a Markdown source mode for notes, its block-level application to the document, and its keys.

## Impact

- Web: a lazy `web/src/app/editor/MarkdownSource.tsx` (a textarea) and a block-diff helper in `web/src/lib/` next to the Markdown parser the fold-back already uses; the slash menu, the Formatting toggle area, `web/src/lib/shortcuts.ts` (`editor.source`); catalogs, stories.
- Docs: `docs/notes-and-subtasks.md` (Write notes), `docs/keyboard.md` (generated).
- Size: about 1 KB gzip, loaded with the editor chunk on first use of the mode; first load unchanged.
