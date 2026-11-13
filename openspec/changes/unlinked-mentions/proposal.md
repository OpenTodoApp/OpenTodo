# Proposal

## Why

Linked references show what someone already linked. They miss the notes that name an item without linking it: a meeting note that says "Trip to Lisbon" in passing, a project note that names "Kitchen quotes". People find those only by searching for the title by hand. Showing them under Linked references, with one action to link them, turns plain mentions into connections without retyping anything.

## What Changes

- **Unlinked mentions.** Under Linked references of a standalone note, a task and a project, one folded line **Unlinked mentions** with the count. Expanded, it lists the task notes, project notes and standalone notes the user can read whose text contains the item's title but does not link to it, newest change first, each with its line and the title highlighted.
- **What counts as a mention:** the whole title, as whole words, case and accents ignored, Markdown syntax ignored; never inside code, an existing link, or the item's own note; titles shorter than 3 characters, and the default "Untitled note", are never matched.
- **Link.** Each row has a **Link** button that turns that mention into a link to the item, as an edit of the source note's document, with one Undo. Viewers of the source's shared project see the row without the button.
- Device-only: computed from the local, decrypted notes, offline and on encrypted accounts; nothing is sent to the server.

No new op field, entity, route, dependency or mandatory environment variable. Not **BREAKING**.

Out of scope: mentions of a title's aliases or of part of a title; linking every mention at once; unlinked mentions in MCP, the CLI and `internal/notelinks` (they keep `links` and `linked_from` only); the graph (`notes-graph`) does not draw mentions.

Roadmap: the "Notes area" in ROADMAP.md, after `notes-space`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `note-links`: Unlinked mentions under Linked references, the Link action, and their place in the link index budget.

## Impact

- Web: `web/src/lib/noteLinks.ts` (or the link index module) gains a title matcher over the index's plain text; a small `UnlinkedMentions.tsx` beside the Linked references component, lazy with it; catalogs and stories.
- Docs: `docs/note-links.md`.
- Size: a few hundred bytes gzip in the lazy notes chunk; first load unchanged.
