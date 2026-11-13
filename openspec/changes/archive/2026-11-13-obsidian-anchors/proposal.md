## Why

Obsidian's own `open` action opens a note at a heading or block when `file` carries an encoded anchor: `obsidian://open?vault=V&file=Note%23%5Eabc123` (GitHub issue 1287, point 4, tested on Obsidian 1.15). Tasks written inline in long notes are much easier to find that way. Today such a link parses, but the origin check wants the anchor inside `id` (`Note#^abc123.md`), so the chip reads `Note#^abc123` and `origin:` search by the note's path misses it.

## What Changes

- A `#` with text on both sides in an Obsidian link's decoded `file` can start an anchor: `id` may be the path of the part before it, and the URL keeps the anchor. A note whose name has a `#` stays valid with the whole file as `id`, as the Obsidian plugin writes it. Still `open` only, still exactly `vault` and `file`.
- Go (`internal/origin`) and TypeScript (`web/src/lib/taskOrigin.ts`), pinned by new shared vectors. The shells check only the link's shape, which is unchanged.

## Capabilities

### Modified Capabilities

- `task-management`: Origin validation reads an anchor in an Obsidian link's `file`.

## Impact

- No new setting, schema field or dependency. Clients older than this change show an anchored origin as a plain label (its link check fails on the id), the same as any origin they cannot validate; the task is unchanged.
