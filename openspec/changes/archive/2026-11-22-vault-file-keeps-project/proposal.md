# Proposal

## Why

A project file that loses its `opentodo-id` front matter at a path the vault already knows is read as a brand-new file. Two ways this happens: the person empties the file on purpose, or they delete the front matter. The spec then creates a second project named after the file and writes the original project back as `<name> 2.md`. One deliberate edit leaves a duplicate project in the app and an extra file in the folder. It showed up while fixing the half-saved-file data loss (#1799): a file still empty after the half-saved hold took this path.

## What Changes

- A `.md` file without `opentodo-id`, at a path the last sync recorded for a live project, keeps that project. Its lines merge as that project's lines, as any edit would. A file emptied on purpose therefore trashes that project's tasks once the half-saved hold has passed, and keeps the project. The next write puts the front matter back. Missing front matter is not read as a colour or icon edit.
- A `.md` file without `opentodo-id` at a path the vault does not know still creates a project, as today.
- A file whose `opentodo-id` names a project the account does not have still becomes a new project with a warning, as today.
- Both engines (`ot vault` and the Obsidian plugin) behave the same, pinned by a new shared sync vector.

Not **BREAKING**: no op field, route, environment variable or state-file change.

**Out of scope:**
- Matching by file name when the path is new, for example a renamed file that also lost its front matter: it still becomes a new project.
- Recovering a project whose file was replaced by an unrelated file at the same path: it keeps the project, as a deliberate edit would.

ROADMAP.md item advanced: none. This is a correctness fix to the shipped `markdown-vault` capability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-vault`: in "Project files and folders", a file without `opentodo-id` at a path the vault knows for a live project keeps that project, and gains the front matter on the next write. Only a file at a path the vault does not know creates a project.

## Impact

- **Code:** file-to-project matching in `internal/vault/merge.go` (`mapFiles`) and `obsidian/src/vault/merge.ts`, and the front-matter edits in both (`projectEdits`).
- **Data model, op log, sync:** none. The same ops as any edit to that project's file. It converges as before: field-level, last writer wins.
- **Offline:** the vault syncs from local files and its state file, so the rule applies on the next sync; nothing changes for devices that are offline.
- **Shared vectors:** a new case in `internal/vault/testdata/sync/`, replayed by the plugin's tests.
- **Size:** no dependency; no change in image size or memory.
