# Proposal

## Why

A user wrote: "When I enable the option to open the task in the sidebar, I can adjust its width. It would be great if this adjustment were also possible for the notes. Right now, I find it too close to the edge for writing notes." On a computer a standalone note opens beside the Notes list in the panel slot at the fixed 26 or 30 rem of a project's activity, with the text running to the pane's edges. A note is for writing; it needs the room and the margins a task panel can do without.

## What Changes

- On the Notes page from 1024 px, the docked note gets the docked task's resizable left edge: drag it, click it (the widest, then the default again), or focus it and press ← or → (Shift for larger steps, Home for the default). The width is kept on this device under its own key, apart from the task panel's.
- The docked note opens wider by default (about half the content, between 30 and 48 rem) instead of the activity panel's 26 or 30 rem.
- The note's title, text, Project and Labels stand in one column with comfortable padding, at most 40 rem wide and centred when the pane is wider.
- Phones and windows under 1024 px are unchanged: the note opens as its page.
- No new op field, entity, route, setting, dependency or shortcut. Not **BREAKING**.

Out of scope: resizing the other panel occupants (project activity, history, the planning list); a full-width or focus mode for notes; changing the task panel.

Roadmap: a follow-up of "Notes area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notes-page`: the docked note's width and writing column.

## Impact

- Web: `web/src/app/notes/NoteEditor.tsx` (the note pane), `web/src/app/PanelFrame.tsx` (an edge slot), `web/src/app/sidePanel.tsx` and `web/src/app/panel.ts` (the resize handle and the width store take the store they keep), `web/src/index.css` (`:root[data-note-split]`), one new message in every catalogue.
- Docs: `docs/notes.md`.
- Size: a few hundred bytes gzip in the lazy Notes chunk; the first load stays within its budget, unchanged.
