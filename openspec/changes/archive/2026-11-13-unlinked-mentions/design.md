# Design

## Context

`note-links` keeps a device-side index of the links in every note's Markdown projection (`description`), built without decoding documents and updated per changed source. Linked references read it. Unlinked mentions need the same sources' plain text matched against one title: the title of the item that is open.

## Goals / Non-Goals

Goals: show plain mentions of the open item where the user already looks for connections; one action to link one; no cost while the section is folded.

Non-goals: fuzzy or partial matching, aliases, a server index, bulk linking.

## Decisions

### D1. Matched lazily, only when expanded

The folded line shows a count; computing it needs the match. The match runs when the item opens, in idle time after Linked references are painted, over the index's normalised plain text (Markdown stripped, code and link text removed, case folded, accents removed), so it never decodes a document. A note's normalised text is cached in the index next to its links and rebuilt only when that source changes. The title is normalised the same way and matched as whole words (word boundaries by `Intl.Segmenter` where available, else Unicode letters and digits). The count line is hidden while the count is 0.

Alternatives considered:
- **Search with `noteSearch` per open.** Rejected: it ranks and snippets every word separately; a phrase over the cached normalised text is cheaper and exact.
- **Count always shown, even at 0.** Rejected: a line that says "0" is noise (the bar).

### D2. What never matches

Titles under 3 characters after normalisation, "Untitled note", the item's own note, text inside inline code and code blocks, the visible text of any existing link (to anything), and sources the user cannot read (Trash, another member's personal note). A source that already links to the item is not listed even when it also mentions it plainly elsewhere: it is in Linked references.

### D3. Link edits the source document

**Link** opens the source note in the device's copy, finds the first plain mention at the recorded position (re-checked against the current text), and replaces that text with a link node to the item through the editor's document transaction, the same as typing `[[`. The write is one batch with the document and its projection, so it merges with concurrent edits like any note edit and is undone with one Undo. When the text moved or changed since the match, the row re-matches; when no mention is left, the row disappears. Offline it is a local batch like any edit.

Alternatives considered:
- **Rewrite the projection and fold it back.** Rejected: a plain-text write replaces the document and would drop concurrent edits.

### D4. Interface budget

No chrome: the line sits in the existing Linked references area (end of a standalone note, below a task's notes, inside the project note area's folded line). No new scroll region; the expanded list flows in the panel's or page's own scroller. No new shortcut: rows and their Link buttons are in the Tab order; Enter on a row opens the source.

## Data model

None. No field, op, route or table. The device cache of normalised text is memory only.

## Size and memory

A few hundred bytes gzip in the lazy notes chunk. Memory: the normalised text of each note beside its links, about the size of the projection; on the 10,000-task notes fixture within the existing index budget (measured by the `note-references` nightly metric).

## Risks / Trade-offs

- Common titles ("Plan", "Notes") produce many mentions. The list is folded by default and shows at most 50 rows with Show more.
- Whole-word matching differs across scripts; languages without spaces fall back to `Intl.Segmenter` words, and without it to a plain substring match for those scripts only.
