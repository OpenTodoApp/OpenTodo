## Why

Obsidian's own `open` action opens a note at a heading or block when `file` carries an encoded anchor: `obsidian://open?vault=V&file=Note%23%5Eabc123` (GitHub issue 1287, point 4, tested on Obsidian 1.15). Tasks written inline in long notes are much easier to find that way. Today such a link parses, but the origin check wants the anchor inside `id` (`Note#^abc123.md`), so the chip reads `Note#^abc123` and `origin:` search by the note's path misses it.

## What Changes

- A `#` in an Obsidian link's decoded `file` starts an anchor; the note is the part before it. `id` is the note's path without the anchor; the URL keeps it. Neither side may be empty. Still `open` only, still exactly `vault` and `file`.
- Go (`internal/origin`), TypeScript (`web/src/lib/taskOrigin.ts`) and the Android and iOS shells' link checks, pinned by new shared vectors.

## Capabilities

### Modified Capabilities

- `task-management`: Origin validation reads an anchor in an Obsidian link's `file`.

## Impact

- No new setting, schema field or dependency. Clients older than this change show an anchored origin as a plain label (its link check fails on the id), the same as any origin they cannot validate; the task is unchanged.
