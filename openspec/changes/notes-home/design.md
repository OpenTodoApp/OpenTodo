# Design

## Context

- The Notes page (`notes-page`, archived change `notes-overview`): the compact tool head ("Notes", the count, New note, Help), one row with the search field and the Source, Project and Label filters (behind one Filters button on a phone), then the list: task, project and standalone notes newest change first, 50 at a time with Show more. Keys: `g e`, `q` New note, `/` search, `j`/`k`/Enter, Escape back to the list. Code in `web/src/app/notes/`, list logic in `web/src/lib/noteList.ts`.
- Notes is a More destination that can be promoted to the primary destinations (`app-shell`); that is the existing "pin Notes to the sidebar".
- Favourites are one synced, ordered string `user_prefs.favourites` of `kind:id` entries (`project`, `label`, `view`), personal, last-writer-wins as one value; every client since 1.0 keeps unknown kinds as they are (`parseFavourites` in `v1.0.0:web/src/lib/favourites.ts`). The MCP tool `set_favourite` accepts `kind: "project"` only.
- `note-links` provides the device's link index (target → sources).
- Budget that bounds this change: `notes-page` 400 ms desktop / 1,200 ms phone.

## Goals / Non-Goals

**Goals:** start writing in one keystroke from the page; keep the few notes that matter at the top; surface notes that are not connected to anything; no new page, no new chrome row, no new shortcut.

**Non-Goals:** widgets, statistics, folders, grouping choices, a journal.

## Decisions

**D1. Evolve the Notes page; no second page.** `/notes` stays the one place for notes. "Home" is not a new surface: it is what the existing page shows when the search field is empty and no filter is set. Alternative: a dashboard page with sections (Pinned, Recent, By project, Unlinked, Daily) and the current list one click away. Rejected: two pages for one purpose, more chrome, and sections that duplicate the filters.

**D2. What is on it, what is cut.**

| Idea | Decision | Why |
|---|---|---|
| Write right away | In, from the search field (D3) | no extra control; the field is already focused by `/` |
| Search | Kept as is | |
| Pinned notes | In (D4) | the one thing a recency list cannot do |
| Recent notes | Kept: it is the list | already newest change first |
| Unlinked notes | In, as a Source value (D5) | a filter, not a region |
| Notes by project | Cut | the Project filter answers it in one step; sections for 60 projects would bury everything else |
| Daily note | Cut from this change (open question 1) | |
| Tag cloud, statistics, "on this day", cards, folders, templates | Cut | none serves "write or find a note" |

**D3. Write from the search field.** While the field holds text, the list's first row is **New note "<text>"** (the note icon, the text as typed). The list cursor starts on the first matching note when there is one, as today, otherwise on the New note row; Up from the first result reaches it, and Enter opens what the cursor is on. Creating writes one note titled with the text (trimmed, at most the title limit) in the current Project filter's project (none without one), clears the field, opens the note docked (a page on a phone) with the caret in its body. On a phone the row is a 48 px tappable row. Alternatives: Enter always creates (a searcher who types "ferry" and presses Enter would create a note instead of opening "Trip"); a separate composer row above the list (a third row of chrome, over the interface budget). Both rejected. `q` and New note keep working as today.

**D4. Pinned notes.** A pin is the favourite entry `note:<id>` in `user_prefs.favourites`, for standalone notes only.
- **Where you pin:** the row menu (Pin / Unpin), the note's own menu, and the palette ("Pin note", "Unpin note" while a note is open). No shortcut.
- **On the page:** with an empty field and every filter at its default, the list shows **Pinned** (pinned live notes in the favourites order), then **Recent** (all other notes, newest change first, 50 at a time with Show more, the count unchanged). The group headers are list group headers, not chrome. Without a pinned note there are no headers: the page looks exactly as today. Any search or filter shows the one flat list it shows today, pinned notes in their ordinary place.
- **Elsewhere:** a pinned note is listed in the sidebar's Favourites group with the note icon and no count, opening the note, reorderable and unpinnable from its menu like any favourite (open question 2).
- **Sync and older clients:** the preference is one last-writer-wins value as today; a pin made offline appears at once and syncs later. A 1.0 client ignores `note:` entries and keeps them when it pins a project. A pin of a note in the Trash is not shown and comes back with the note.
- **Agents:** `set_favourite` accepts `kind: "note"` for a standalone note the caller can read, through the same write gate.
- Alternative: a `pinned` field on the note entity. Rejected: it would be shared with every member of a shared project (a pin is personal), and it needs a schema field when the favourites list already carries personal pins.

**D5. Unlinked.** The Source filter's values become All, Task notes, Project notes, Standalone only and Unlinked. Unlinked lists standalone notes not in the Trash that no note the user can read links to (outgoing links do not count: a note that only points elsewhere is still an orphan), newest change first, paginated like the list. It reads the `note-links` index (built on choosing the filter, in slices); without `note-links` the value is not offered. Task and project notes are never "unlinked": their task or project is where they live. Alternative: an Unlinked section on the home. Rejected: it would grow without bound on an account that never links, and it would repeat notes already in Recent.

**D6. Keyboard and phone.** No new shortcut. `/` focuses the field, typing then Enter creates or opens (D3), Escape returns to the list, `j`/`k` move over group headers as over task-list groups, `q` creates. On a phone: the field at the top, Filters behind one button (Unlinked inside the Source choice), Pinned and Recent as list groups, the New note row 48 px; pin from the row's long-press menu.

**D7. Performance.** The groups and the New note row are computed from the entries the page already builds; pinned lookups are a set of ids. The `notes-page` budget is unchanged and measured as before; Unlinked reuses the index whose cost `note-links` bounds.

## Data model impact

None. A new favourite kind `note` in the existing `user_prefs.favourites` string (an additive convention; no op field changes). No migration.

## Size and memory

No dependency. Under 1 KB gzip in the lazy Notes chunk; the sidebar's favourite kind adds under 0.3 KB to the first load, within `web/bundle-budget.json`. No server or memory change.

## Interface budget

- **Chrome rows:** the tool head and the one search and filter row: 2, unchanged. Pinned and Recent are list groups; the New note row is a list row.
- **Properties per row:** unchanged (at most 5).
- **Sidebar destinations:** none added; pinned notes join the existing Favourites group, which is not a primary destination.
- **Scroll regions:** unchanged (the list, plus the docked panel's own).
- **Shortcuts:** none added.

## Risks / Trade-offs

- [A searcher creates a note by accident] → only when nothing matched and the cursor is on New note; Undo removes it.
- [Many pins push Recent down] → pins are deliberate; the Pinned group shows all of them, and unpinning is in the row menu.
- [A pinned note in the sidebar grows Favourites] → the user chose it; open question 2 keeps the page-only option open.

## Migration Plan

Additive; no data to move. Rollback: `note:` favourites stay in the preference, ignored by older builds.

## Open questions for the owner

1. **Daily note.** Recommendation: out of this change. A daily note is a journal, a second purpose next to Today and the weekly review, and it invites templates and a calendar of notes; if people ask, a small later change can add "Today's note" (one standalone note per date, created on first open) without touching this design.
2. **Pinned notes in the sidebar's Favourites.** Recommendation: yes, one pin concept for projects, labels, views and notes; the alternative is pins that only order the Notes page, which needs a second preference.
3. **Where a note created from the search field goes.** Recommendation: into the project of the Project filter when one is set, else no project, so writing inside a filtered view keeps the note in view.
