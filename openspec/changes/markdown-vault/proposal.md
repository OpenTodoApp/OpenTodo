# Proposal

## Why

People who keep their notes in Obsidian or in plain Markdown files have no way to keep their tasks there too: OpenTodo's export is JSON, the CLI is a command at a time, and the two-way CalDAV sync speaks to calendar clients, not to a folder of text. A Markdown vault turns one folder of `.md` files into a full device of the account: every project is a file, every task a checklist line in the Obsidian Tasks format, edited in any editor and synced both ways by the `ot` command. ROADMAP.md lists "a Markdown vault for Obsidian and plain-text people" among the ideas set aside; this change builds it.

## What Changes

- **A folder is a device.** `ot vault init <dir>` makes a folder a vault of the signed-in account and `ot vault sync` keeps it in two-way sync: the vault is an ordinary sync device (device id `vault:<id>`) that pulls the account's operations with a cursor and pushes its own through the operation log, so every change made in a file converges with the app, the REST API and every other device under the same field-level last-writer-wins rule, and nothing bypasses the log.
- **One file per project, nested projects as folders.** `Inbox.md` for tasks without a project, `<Project name>.md` for a project, `<Parent>/<Parent>.md` plus one file per child for a project with sub-projects. Front matter carries the project's id, colour and icon. Renaming or moving a file renames or moves the project; a new file creates a project.
- **Tasks as checklist lines in the Obsidian Tasks format.** `- [ ]` and `- [x]` lines carry the title, then the Obsidian Tasks fields spelled out exactly: `📅 YYYY-MM-DD` (do-on date, the task's `due`), `🛫 YYYY-MM-DD` (start date), `✅ YYYY-MM-DD` (done date), `➕ YYYY-MM-DD` (created), `🔁 <rule>` (recurrence), `🔺 ⏫ 🔼 🔽 ⏬` (priority), `🆔 <id>` (the task's id) and `⛔ <id>,<id>` (blocked by). What Obsidian Tasks has no field for travels as Dataview inline fields: `[time:: HH:MM]`, `[deadline:: YYYY-MM-DD]`, `[estimate:: 45m]`, `[someday:: true]`, `[evening:: true]`, `[tz:: Area/City]`. Labels are `#tags`, subtasks are nested lines, sections are `##` headings, task notes are an indented block under the line. `⏳` (scheduled) is recognised as text and preserved, never mapped.
- **Everything else in a file is kept.** Prose, headings that are not sections, other list items, front matter keys the vault does not own, and any text on a task line it does not understand round-trip unchanged. Comments, attachments and tracked time are not written to the file; origin, location, custom fields and tracked minutes are written as read-only inline fields that the next sync restores if edited.
- **Exact conflict rules.** The vault keeps, under `.opentodo/`, its cursor and the last-synced value of every field it writes. A sync merges field by field: a field changed only in the file is pushed; a field changed only in the app is written; the same field changed on both sides keeps the app's value and writes the file's version of that line to `<file>.conflict.md`, reported in the output. A line removed from a file trashes the task unless the app changed it since the last sync; a deleted or missing file is written again from the app, never trashed; a renamed file is matched by its id, not its name.
- **`ot vault watch`** keeps syncing while it runs: the server's live channel wakes it for app changes and a two-second poll of file modification times catches file edits. No new dependency: no file-system notification library.
- **Encrypted accounts work, on the user's machine only.** The vault decrypts and encrypts with the key stored by `ot encryption unlock`; the server keeps receiving only ciphertext. Without an unlocked key the vault refuses to sync and names the command.
- **Limits.** A file of at most 1 MB and 5,000 task lines, a vault of at most 20,000 tasks, a note of at most 64 KB; beyond them the sync stops before any write and says which file.
- **Guide and vectors.** `docs/vault.md` explains the format, the Obsidian setup (Tasks, Dataview queries over `🆔`), the conflict rules and the limits; a fixture vault under `internal/vault/testdata` pins the parser and printer and is round-tripped in tests.

Out of scope: a server-side vault folder with a file watcher on the server (see design D2: the server holds no plaintext for encrypted accounts and one writer, and a folder inside a container is not where Obsidian runs); syncing comments, attachments and time entries into the file (read-only or absent, listed above); project notes in the file body (prose is preserved, not synced); saved views, reminders and habits; a Markdown export in the web app (the CLI vault is the export); an Obsidian plugin; wiki-links between tasks; the Obsidian Tasks `⏳` scheduled date as a field of its own; custom-field edits from the file.

ROADMAP.md: builds the set-aside "Markdown vault for Obsidian and plain-text people"; the change adds it as a shipped row under "Next: Parity and depth". No new mandatory environment variable, no new dependency, and the op log is unchanged: the vault reads and writes the fields that exist.

## Capabilities

### New Capabilities
- `markdown-vault`: the vault folder as a sync device, the file and task line format, what round-trips and what is read-only, the merge and conflict rules, the `ot vault` commands, encrypted accounts, limits and the Obsidian guide.

### Modified Capabilities
- `cli-client`: "Online-only client" gains the one exception the vault needs: the vault commands keep a local state (cursor, last-synced values, file hashes) under the vault's own `.opentodo/` folder, while every other command still holds no local copy.

## Impact

- New package `internal/vault` (parser, printer, merge, state file; stdlib only), linked into `cmd/ot` only, like `internal/e2ee/crypt`: the server binary and image are unchanged; `ot` grows by an estimated 300 KB.
- `internal/cli`: new `vault` command group (`init`, `sync`, `watch`, `status`) in the command table, so `ot schema`, `ot help --json` and the skill file list it; the sync client speaks `POST /api/v1/sync` and `GET /api/v1/sync/events` with a `full` token (the sync route refuses `read` and `agent` tokens, which the CLI reports locally as exit 5).
- No server route, schema, migration or setting changes. Encrypted accounts reuse `ot encryption unlock` (`mcp-projects`).
- Docs: `docs/vault.md` (new), `docs/cli.md`, `docs/import-export.md`, `docs/e2ee.md`, `docs/README.md`, `README.md`, AGENTS.md layout line for `internal/vault`, ROADMAP.md, the agent skill file, CHANGELOG.
