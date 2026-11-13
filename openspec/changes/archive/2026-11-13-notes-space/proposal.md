# Proposal

## Why

Notes now link, pin and have their own home, but they still sit in the sidebar's More menu between Focus and Updates, as if they were one more task view. People open a task list and wonder where their notes went, or open Notes and see a sidebar full of Inbox counts and projects. The owner's request (2026-11-10): notes must not be confused with tasks, they must stay one step away, and the notes home must be a compact list with granular search. Notes can carry a project and labels like tasks; search should reach them the way the task filter does.

## What Changes

- **A space switch.** A quiet two-option control **Tasks | Notes** at the top of the sidebar, under the workspace control. Tasks is the sidebar as today. Notes turns the sidebar's content into: All notes, Pinned (pinned notes in the favourites order) and Recent (the most recently changed standalone notes). Choosing a space opens its home (Tasks: the start view; Notes: `/notes`) and is remembered on the device. Opening a note route from anywhere switches the sidebar to Notes; opening a task, project or other task view switches it to Tasks. Settings, Help and the other neutral screens keep the space as it was. The phone drawer shows the switch at its top; the bottom tab bar is unchanged.
- **Notes leave the More menu.** The More entry is removed and Notes is no longer promotable. A promotion of `notes` stored by an earlier version is ignored by this client and kept in the row, so a 1.0 client or an earlier 1.x client still reads it as before. Pinned notes leave the Tasks space's Favourites group; they are listed under Pinned in the Notes space. The pin itself is unchanged.
- **A compact list.** One line per note: kind icon, title, where it lives (the note's project, the task's project, the project of a project note, Inbox for a task note without a project), its labels as quiet chips, and the relative time of the last change, on one row grid. While words are searched, the snippet follows the title on the same line. Pinned and Recent headings and Show more stay.
- **Granular search.** The search field takes words and filter tokens, each shown as a removable chip: `in:<project>` (or `#project`, sub-projects included), `@label` (or `label:<label>`), `kind:note|task|project`, `linked:<note>`, `orphan`, `pinned`, and `changed:` with `<7d`, `>30d`, `today`, `yesterday` or a date. Suggestions open as a token is typed (the Combobox primitive). The Source, Project and Label filters are replaced by tokens; the filters stored on a device are converted once. Tokens are client-only: matching runs on the device over local and decrypted data, offline included.
- Keyboard: `g e` keeps opening Notes and now also switches the sidebar to Notes; every task `g` key switches it back. `g n` stays Anytime (since 1.0).

No new op field, entity, route, dependency or mandatory environment variable. Not **BREAKING**.

Out of scope: the full-page graph, its **List | Graph** toggle in the Notes header and the `/notes?view=graph` route (sibling change `notes-graph-page`, which also adds the Graph row to the Notes sidebar); searching notes across workspaces (the workspace control above the switch scopes the space); tokens in `ot notes search`, MCP `search_notes` and `internal/notesearch` (they keep their own project and label parameters); folders; a third space.

Roadmap: the "Notes area" in ROADMAP.md, after `note-pane-width`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: the sidebar has two spaces; Notes leaves the More group; the Favourites group lists no notes in the Tasks space.
- `notes-page`: one-line rows with labels; search tokens with chips and suggestions replace the filters; the phone layout without a Filters sheet.
- `keyboard-shortcuts`: the go keys choose the sidebar's space.

## Impact

- Web: `web/src/app/Sidebar.tsx`, `FavouritesGroup.tsx`, a small `web/src/lib/sidebarSpace.ts` and `web/src/app/SpaceSwitch.tsx` in the entry; a lazy `web/src/app/notes/NotesSidebar.tsx`; `NotesPage.tsx`, `NoteRow.tsx`, a new `NoteSearchField.tsx` and `web/src/lib/noteQuery.ts` (lazy, with the Notes chunk); `NoteFilters.tsx` removed; `web/src/lib/appearance.ts` (Notes no longer promotable); the start-view navigation moved from `Shell.tsx` to `web/src/app/startView.ts`; catalogs, stories.
- Docs: `docs/notes.md`, `docs/notes-home.md`, `docs/keyboard.md` (generated), `docs/views.md` where the More list names Notes.
- Size: the switch adds a few hundred bytes to the entry chunk, offset in part by the removed More entry; the Notes sidebar, the tokens and the search field load with the Notes chunk.
