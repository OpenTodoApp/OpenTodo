# Proposal

## Why

The Notes page is a good index of everything written, newest first, but it is not yet a place to start from: writing takes a click on New note, the notes that matter most sink as others change, and notes nobody links to are invisible. A calm home for notes (in the spirit of Apple Notes) makes the Notes page the start of writing and finding, without adding a second page or a dashboard of widgets.

## What Changes

- The Notes page at `/notes` becomes the home for notes. It keeps its header, one row of search and filters, and the list, and gains:
  - **Write from the search field.** While text is typed, the first row is **New note "<text>"**; when no note matches, it is under the cursor and Enter creates the note with that title and puts the caret in its body. When notes match, the cursor starts on the best match, as today, and Up reaches the New note row.
  - **Pinned notes.** A standalone note can be pinned from its menu (and the palette). With no search and no filter, pinned notes are listed first under **Pinned**, then every other note under **Recent**, newest change first as today. Without pins the list looks as it does now.
  - **Unlinked notes.** The Source filter gains **Unlinked**: standalone notes that nothing links to (needs `note-links`; until it ships the option is absent).
- A pin is a favourite of a new kind `note` in the existing synced favourites preference, so a pinned note also appears in the sidebar's Favourites group, one pin concept across the app. Clients that do not know the kind keep it unchanged (1.0 included). The MCP tool `set_favourite` accepts `kind: "note"`.
- Cut, on purpose: notes grouped by project (the Project filter does it in one step), statistics, tag clouds, cards or a grid, folders, templates, "on this day", and a daily note (recommended out; see the open questions).
- No new op field, entity, route, dependency or shortcut. Not **BREAKING**.

Out of scope: a second Notes page or a dashboard; pinning task notes or project notes (tasks and projects have their own places and project favourites); sorting choices; the graph (`notes-graph`).

Roadmap: the second step of "Notes area" in ROADMAP.md. It ships after `note-links`; everything except Unlinked also works on its own.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notes-page`: the default list shows Pinned and Recent; the search field can create a note; the Source filter gains Unlinked; pinning a note.
- `appearance-preferences`: the favourites preference accepts notes.
- `app-shell`: the Favourites group lists pinned notes.
- `mcp-server`: `set_favourite` pins and unpins notes.

## Impact

- Web: `web/src/app/notes/NotesPage.tsx`, `NoteRow.tsx`, `NoteFilters.tsx`, `NoteEditor.tsx` (Pin in the note menu), `web/src/lib/noteList.ts` (groups, the Unlinked source), `web/src/lib/favourites.ts` (kind `note`), the sidebar Favourites group, the palette's note commands, the six language catalogues, the Notes stories and baselines.
- Server: `internal/agenttools/write_structure.go` (`set_favourite` kind `note`).
- Docs: `docs/notes.md`.
- Size: under 1 KB gzip in the Notes chunk, first load unchanged.
