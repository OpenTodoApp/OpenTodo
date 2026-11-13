# Design

## Context

The Notes page (`notes-page`, as `notes-space` leaves it) lists notes by the time the note's text last changed, newest first, with Pinned first and Recent after, 50 at a time. Its header holds the title, the count, New note and Help, and keeps a place for the view switch of `notes-graph-page`, which brings a **⋯** menu in Graph mode.

## Goals / Non-Goals

Goals: find a note by name or by age without searching; no new row; nothing synced.

Non-goals: manual order, sorting by project or label, a sort on the server.

## Decisions

### D1. Three orders in the header's overflow menu

A **⋯** menu in the header (in List mode it holds only Sort; in Graph mode the graph's items follow a separator) with a radio group **Sort**: Last changed, Created, Title. The checked item carries an arrow for its direction. Picking the checked item flips the direction; picking another sets it with its natural direction (Last changed and Created newest first, Title A–Z).

Alternatives considered:
- **A Sort control in the search row.** Rejected: it competes with the chips for the row on a phone, and most people never change the sort.
- **Column headers that sort on click.** Rejected: the one-line row has no header row, and adding one is a row of chrome.

### D2. What each order compares

- Last changed: the note's own change time as today (a task's other edits do not count).
- Created: `created_at` of a standalone note; for a task note, the task's creation time; for a project note, the project's creation time. Ties fall back to the last change, then the id.
- Title: the shown title (task title, project name, note title), compared with `Intl.Collator` in the app language with numeric ordering ("Week 2" before "Week 10"), accents secondary; empty titles ("Untitled note") last in both directions. Ties fall back to the last change.

### D3. Device state, applied to the list without words

The order is stored on the device (`ot.notes.sort`, `deviceStorage`), never synced and never an op; storage refused, it holds for the visit. Pinned keeps the pin order. Search results keep their ranking (title matches first) because a sort that hides the best match is worse than none. Chips without words keep the chosen sort, since they filter rather than rank. The Recent heading reads the order's name (Recent, Oldest changed, Newest, Oldest, A–Z, Z–A) so the list says how it is ordered without helper text.

## Data model

None: every order reads fields the device already has (`created_at` of notes, tasks and projects). No new field.

## Size and memory

Comparators and the menu add a few hundred bytes to the lazy Notes chunk. Sorting 10,000 entries with a collator stays within the Notes list budget of `performance-budgets` (one sort per change of order, cached by order).

## Interface budget

No new row: the menu sits in the header among the existing actions. Rows above the first item stay the header and the search field. No new shortcut; the menu is reached with Tab like every header action.

## Risks / Trade-offs

- A title sort mixes the three kinds; the kind icon on each row keeps them apart.
- People may expect search results to follow the sort; the rule "search ranks, the list sorts" is stated once in the docs.
