## Why

`ot vault watch` waits until a changed file has held still before a sync reads it (#764), but a sync takes a moment: it reads the folder, pulls, pushes and only then writes the files. A save that lands in that window, typically Obsidian's autosave while the user keeps typing, was overwritten by the file the sync printed from what it had read, and the new text was lost. The same applied to a file the sync removes (a project archived in the app) and to TaskNotes notes.

## What Changes

- Right before it writes or removes a project file or a task note, the vault reads the file again and compares it with what the sync read. When it changed, the file is left as it is, the sync reports "skipped <file>: it was saved while the sync ran; the next sync merges it", and the file counts as changed for the next sync.
- The next sync merges that save three ways against the values the file was printed from (kept in the state file as `held`), so the save reaches the app and the app's changes made meanwhile reach the file; nothing is reverted.
- A new line (or a new note) the sync turned into a task still gets its `🆔` id (its `opentodo-id`) written into the saved file, matched by the line's text, so the next sync does not create the task twice.
- A file renamed to a conflict file takes its content as it is at that moment.

Out of scope: the Obsidian plugin's TypeScript engine (it already writes only while a file holds what it read; carrying `held` and the fresh ids there is a follow-up), a save that lands in the microseconds between the check and the rename, and lines whose text was also edited during the sync (they become a new task, as an unsynced new line would). Advances no ROADMAP.md row: a follow-up to #764. No **BREAKING** change: no op field and no environment variable; the state file gains an optional field older `ot` versions ignore.

## Capabilities

### New Capabilities

### Modified Capabilities
- `markdown-vault`: the watch mode requirement gains the check before a write.

## Impact

`internal/vault/plan.go`, `engine.go`, `merge.go`, `notewrite.go`, `state.go`, new tests in `internal/vault/race_test.go`; `docs/vault.md`. No API route, data model or dependency.
