# Proposal

## Why

A vault file read while an editor is saving it can be read part way: cut short at any byte, or cut inside its front matter. The vault already holds a file read empty during a save (#1799, #1831). This change gives a file read part way, and a known file whose `opentodo-id` was damaged, the same care, so that a save in progress never changes the account.

## What Changes

- A file cut short of what the last sync wrote, that lost a task line found in no other file, is held like an empty one, for up to five minutes. Cut short means shorter, with everything up to its last line end equal to a part of the written text that ends at a line end. The file is neither read nor written while held. Then it is read as it is.
- The vault keeps the length of each file it writes, and a short hash of each part of it that ends at a line end. Past 5000 lines it keeps no prefix hashes: a shorter file without its last line end counts as cut short.
- While a file is held, a change made in the app to one of its tasks still counts as the app's change when the file is read. The file's base is held apart, and the store takes the app's values. This applies to the empty-file hold too.
- A file whose `opentodo-id` is damaged (no longer an id), at a path the last sync wrote for a live project, keeps that project, as a file without front matter does. The id is written back, and a warning names it. A well-formed id of no project of the account (a file from another account) still makes a new project.
- Both engines (`ot vault` and the Obsidian plugin) behave the same, pinned by the shared sync vectors. The vectors' states pin the new state fields byte for byte.

Not **BREAKING**: no op field, route or environment variable. The state file gains `size` and `prefixes` per file, both optional, and may now hold `held` rows for a held file. A file written by an older engine has no `size`, so it is not held when cut short until the next write. An engine from before this change ignores `held`, as it already did for a file saved during a sync: if such an engine syncs the same folder while a file is held, it merges that file against the app's newer values, and a change the app made meanwhile can be undone. One folder synced by an older and a newer engine within the same five minutes is the only way to reach this.

**Out of scope:**
- A cut that only removes the end of the last line, when that line has no line end, isn't detected.
- A user who deletes the last lines of a file on purpose has them trashed only after the hold, up to five minutes later.

ROADMAP.md item advanced: none. This is a robustness fix to the shipped `markdown-vault` capability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-vault`: "Merge and conflict rules" holds a file cut short like an empty one. "Project files and folders" lets a known path keep its project when the id names no project.

## Impact

- **Code:** `internal/vault` (`engine.go` halfSaved, cutShort, allMoved, saveBase, holdRaced; `state.go` FileState; `plan.go`; `merge.go` mapFiles) and `obsidian/src/vault` (`engine.ts`, `gojson.ts`, `plan.ts`, `merge.ts`, `state.ts`, `types.ts`).
- **Data model, op log, sync:** none. A held file pushes nothing until it is read. It then pushes the same ops as any edit, which converge field by field, last writer wins.
- **Offline:** the hold is the vault's own state, so it works the same offline.
- **State size:** 16 hex characters per line of each written file, at most 5000 lines per file.
- **Shared vectors:** five new cases in `internal/vault/testdata/sync/`. The existing ones gain the new state fields.
