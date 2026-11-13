# Proposal

## Why

`ot vault` keeps projects and tasks as Markdown files, but standalone notes stay inside the app: `standalone-notes` "Integrations that leave notes out" names the vault, and `docs/vault.md` says notes are not written. People who chose OpenTodo for data ownership expect their meeting notes, recipes and reading lists to be plain files too, editable in Obsidian or any editor and still synced. flatnotes is built on exactly that promise ("your notes are just markdown files"); the vault already has the machinery to keep it: a sync device, front matter matched by id, three-way merges, conflict files and encryption on the user's machine.

## What Changes

- **A `Notes/` folder in the vault.** With notes on, each live standalone note is one file `Notes/<title>.md` at the vault's root (no sub-folders: projects and labels organise notes, as in the app). Front matter holds `opentodo-id`, `project` (an Obsidian link to the project's file, such as `"[[Home]]"`, or absent for a note without a project) and `tags` (the labels, spelled as the vault's `#tags`); the body is the note's Markdown. Other front-matter keys are kept byte for byte.
- **Files are notes.** Renaming a file renames the note; a new `.md` file in `Notes/` without `opentodo-id` creates a note; editing `project` or `tags` moves or relabels it; a title change in the app renames the file. Two notes with one title get a numeric suffix; an empty title is written as "Untitled note".
- **The body merges.** A body changed only in the file is pushed as a plain-text write folded into the note's document (`rich-text-editing`); changed only in the app it is written to the file; changed on both sides since the last sync it is merged line by line against the last-synced text, and only overlapping edits go to `Notes/<title>.conflict.md` with the app's text kept. Title, project and tags merge per field like task fields.
- **Links work in Obsidian.** A link to a note or a project in a note's Markdown (`[Trip](?note=<id>)`, `[Home](?project=<id>)`) is written as a relative link to that file (`[Trip](Trip.md)`, `[Home](../Home.md)`) and read back to the id form; task links stay as they are.
- **Delete and Trash.** Deleting a note's file moves the note to the Trash when nothing changed on it in the app since the last sync, and otherwise writes it again and reports it. A note trashed in the app loses its file when unchanged since the last write, and is renamed `.conflict.md` when not. A note a viewer of a shared project cannot edit is written and its file edits are reported and written back, never pushed.
- **On for new vaults, a switch for existing ones.** `ot vault init` turns notes on; an existing vault keeps working as it is until `ot vault notes on` (`ot vault notes off` stops writing and syncing notes and leaves the files). The state file gains an optional `notes` member that older `ot` versions ignore.
- **Limits:** 64 KB per note body and 5,000 notes per vault, checked before any write or push like the other vault limits. Encrypted accounts decrypt and encrypt on the machine as for tasks.
- `standalone-notes` "Integrations that leave notes out" no longer lists the vault.

No op field, route, server change or environment variable. Not **BREAKING**: existing vaults are unchanged until notes are turned on, and the state file member is optional.

Archive order: after `note-webhooks` (which follows `notes-in-routines`); the three edit "Integrations that leave notes out" in turn.

Out of scope: the Obsidian plugin's vault sync (`obsidian-vault-sync` ports the engine; it leaves `Notes/` alone until it ports this too); task notes and project notes as separate files (they stay inside their task lines and project files); folders inside `Notes/`; attachments and images of a note as files; wikilinks `[[…]]` read as links (they are kept as text).

Roadmap: the "Notes area" in ROADMAP.md, and the `markdown-vault` item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-vault`: standalone notes as files in `Notes/`, their merge, links, deletion, switch and limits.
- `standalone-notes`: the vault leaves the list of integrations that leave notes out.

## Impact

- CLI only: `internal/vault` (layout of `Notes/`, a note file parser and printer beside `front.go` and `notes.go`, the body's line merge, link rewriting, the state file's `notes` member and per-note last-synced values), `internal/cli` (`ot vault notes on|off`, `init` default, output counts, `ot schema`). The server binary is unchanged; the test that keeps `internal/vault` out of the server still holds.
- Fixtures: notes added to `internal/vault/testdata/vault/` with the guide's example among them; shared sync vectors gain note cases for the plugin's later port.
- Docs: `docs/vault.md` (a Notes section, limits), `docs/notes.md` (the integrations sentence), `docs/cli.md`.
- Size: a few kilobytes in `ot`; no dependency (the line merge is a small diff3 over lines in Go).
