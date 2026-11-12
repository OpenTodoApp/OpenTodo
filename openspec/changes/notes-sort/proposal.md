# Proposal

## Why

The Notes page sorts by the last change of a note's text, newest first. That suits a working set, but once there are hundreds of notes people look for a note by name ("the one starting with Wi-Fi") or in the order they wrote them (a reading log, meeting notes of a series). Today the only way is to search. A sort choice with three orders covers both without adding a row of chrome.

## What Changes

- **Sort** in the Notes page header's overflow menu (**⋯**): **Last changed** (default, today's order), **Created** (newest first) and **Title** (A–Z, by the app language's collation, "Untitled note" last). Choosing the current order again reverses it (oldest first, Z–A), shown by an arrow beside the checked item.
- The choice is remembered per device, like the chips, and applies to the list without words. While words are searched, results keep the search ranking; the sort applies again when the words are cleared.
- **Pinned** keeps the user's pin order; the sort applies to **Recent** (the section is then headed by the order's name: **Recent**, **Newest**, **A–Z**).
- Graph mode (`notes-graph-page`) ignores the sort.
- Keyboard: the overflow menu is reached with Tab and opened with Enter; no new shortcut.

No new op field, entity, route, dependency or mandatory environment variable. Not **BREAKING**.

Out of scope: sorting by project, label or kind (the tokens filter by them); manual ordering of notes; a sort shared across devices or with project members; sort options in `ot notes list` and `list_notes` (they keep newest first).

Builds on `notes-space` (one-line rows, the header's place for actions). Roadmap: the "Notes area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notes-page`: a sort order for the list.

## Impact

- Web: `web/src/app/notes/NotesPage.tsx` and its header (the overflow menu with the Sort group, shared with the graph's menu items when in Graph mode), a small `web/src/lib/noteSort.ts` (comparators, device storage), tests and stories.
- Docs: `docs/notes.md` (The list).
- Size: under a few hundred bytes in the lazy Notes chunk.
