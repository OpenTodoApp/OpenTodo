# Proposal

## Why

Note search finds notes that contain every word typed, with quoted phrases. That is right most of the time, but people with hundreds of notes ask for three things it cannot do: find either of two words ("ferry or train"), look only in titles ("the note called Wi-Fi, not every note that mentions it"), and find notes changed within a stretch of time ("what did I write in October"). Other note apps offer these with a few operators; ours has the tokens to hang them on (`notes-space`) and one search grammar shared by the Notes page, the CLI and MCP (`internal/notesearch`, `web/src/lib/noteSearch.ts`), so adding them once reaches every place notes are searched.

## What Changes

- **`OR` between words.** `ferry OR train` finds notes with either word; words around it still must all match (`lisbon ferry OR train` = lisbon and (ferry or train)). Only `OR` in capitals is the operator; `or` stays a word. Quoted phrases work on either side.
- **Field prefixes.** `title:wifi` and `text:"oat milk"` match only the note's title or only its text. A bare word keeps matching both.
- **A date range for `changed:`.** `changed:2026-10-01..2026-10-31` keeps notes changed on those days, both included, in the viewer's day. It is a Notes page token like the other `changed:` forms and becomes a chip.
- The word grammar (`OR`, `title:`, `text:`) is part of the shared note search: the Notes page, the command palette's Notes section, `ot notes search`, MCP `search_notes` and the routine Find notes step (`notes-in-routines`) read it the same way, pinned by the shared vectors in `internal/notesearch/testdata/vectors.json`.
- Ranking, snippets and highlighting stay as they are; a field-limited word highlights only where it matched.

No new op field, entity, route, dependency or mandatory environment variable. Not **BREAKING**: a query without the operators means exactly what it means today.

Out of scope: `NOT` or `-word` exclusion, wildcards and regular expressions, searching comments or attachments, a search syntax help panel (the help page lists the forms), server-side search on encrypted accounts (the server still never sees encrypted text). The Notes page tokens (`in:`, `@`, `kind:`, `changed:` and the rest) stay client-only; `ot notes search` and `search_notes` keep their own project and label options.

Builds on `notes-space` (the tokens and chips). Roadmap: the "Notes area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notes-page`: search words accept `OR`, `title:` and `text:`; `changed:` accepts a date range.
- `standalone-notes`: the CLI and MCP search use the same word grammar.

## Impact

- Web: `web/src/lib/noteSearch.ts` (query parsing into groups and fields, matching), `web/src/lib/noteQuery.ts` (the `changed:` range token and its suggestion), tests; the palette's Notes section uses `noteSearch` and needs no change.
- Go: `internal/notesearch` (`ParseQuery` returns groups with a field; `Match` follows), `internal/notesearch/testdata/vectors.json` (new cases), callers in `internal/agenttools` and `internal/cli` unchanged in signature where possible.
- Docs: `docs/notes-home.md` (Searching), `docs/note-tokens.md` (the range), `docs/cli.md` and `docs/mcp.md` where note search is described.
- Size: a few hundred bytes in the lazy Notes chunk; nothing in the entry chunk; no binary size change worth noting.
