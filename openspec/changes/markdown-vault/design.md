# Design

## Context

See proposal.md for the motivation. Relevant current state:

- The `ot` CLI (`internal/cli`) is an online client of the REST API: profiles with a `full`, `read`, `agent` or `admin` token, a command table that generates `ot help`, `ot schema` and the skill file, `--json`, `--dry-run`, idempotency keys, exit codes 0–5. It holds no local data except the profile file and, since `mcp-projects`, the unlocked account key under `<config dir>/opentodo/keys/<profile>.json`.
- The sync exchange (`POST /api/v1/sync`, docs/sync.md) is open to any device with a `full` token: `{device, cursor, ops, features}` in, `{ops, cursor, hasMore, serverTime, generation, rejected, memberships, purged}` out, paged at 1,000 ops and about 4 MB. `read` and `agent` tokens are refused on it. The live channel `GET /api/v1/sync/events?device=` wakes a device when others record ops. Device ids are free strings; the server prefixes its own (`server:`, `agent:`, `caldav:`, `issues:`, `public:`), and history labels devices by prefix.
- The op schema already holds every field the vault maps: `title`, `description`, `project_id`, `parent_id`, `section_id`, `priority`, `due` (`{date, time?, tz?}`), `deadline`, `start` (`null`, `"someday"`, date), `evening`, `estimate_minutes`, `labels`, `blocked_by`, `recurrence`, `completed_at`, `completed_by`, `deleted_at`, `position`, `created_at`; project `name`, `color`, `icon`, `parent_id`, `archived`; section `name`, `project_id`, `position`; label `name`.
- `description` is the Markdown projection of `notes_doc` (rich-text-editing): a plain-text write to `description` newer than the document is folded into the document by the next device that opens the note. So the vault writes `description` only and never touches `notes_doc`.
- `internal/recurrence` parses and canonicalises rules and `internal/quickadd` parses durations; `internal/zoned` validates `tz`; `internal/origin` recognises origins; `internal/e2ee/crypt` seals and opens `enc:v1:` envelopes for the CLI only and is never linked into the server.
- The importer (`internal/importer`) turns rows into ops with a planner, but it runs on the server with device `import` and a one-shot semantics (preview, job, undo). It has no notion of a cursor or of a second direction, so it is not reused; its `values.go` helpers for building ops are.
- The tenant's jobs leader runs background pollers (issues, email, calendar feeds). The server has one writer connection.
- Obsidian Tasks (the plugin people use for checklists) reads these fields on a line: `📅` due, `⏳` scheduled, `🛫` start, `➕` created, `✅` done, `❌` cancelled, `🔁` recurrence (`every week`, `every 3 days when done`), `🔺 ⏫ 🔼 🔽 ⏬` priority, `🆔 <id>` and `⛔ <id>,<id>` dependencies (ids from `[A-Za-z0-9_-]`), and, with its Dataview format, `[due:: ]`-style inline fields. Dataview reads `[key:: value]` inline fields and the Tasks emoji fields on list items.

## Goals / Non-Goals

**Goals:**
- A folder of files that a person can read, grep, edit in any editor and query with Obsidian Tasks and Dataview, with no plugin to install for OpenTodo.
- Every file edit is an ordinary op: same convergence, history, undo and limits as any device.
- Deterministic printing: the same entities always print the same bytes, so a sync with no change writes nothing.
- Nothing the user wrote in a file is lost silently: unknown text round-trips, and conflicts are written next to the file and reported.
- Encrypted accounts get the vault without the server ever seeing plaintext.

**Non-Goals:**
- A server-side vault (D2).
- Reusing the vault format as the app's export or import format (the own JSON export stays complete; the vault is lossy by design).
- Supporting every Obsidian Tasks feature (`❌` cancelled, `⏳`, custom statuses): they are preserved as text.
- Watching files with the operating system's notification APIs (D9).

## Decisions

**D1. The vault is a sync device, not a REST script.** `ot vault sync` pulls with a cursor from `POST /api/v1/sync` and pushes ops stamped `vault:<id>`. Why: three-way merge needs to know what changed in the app since the last sync, and the op log gives that per field with a cursor; REST would need a full snapshot diff on every run and could not tell "changed in the app" from "unchanged". Pushing ops also keeps field granularity (a ticked line is one `completed_at` op plus `completed_by`, not a whole-task PATCH), which is what makes concurrent edits converge without conflicts. The vault sends `features: ["clock_skew", "backfill_ack"]`, keeps a hybrid logical clock seeded from `serverTime` and corrects it on `clock_skew` refusals like the web client, and compares `generation` so a restored server makes it rebuild from cursor 0. Alternative: REST only. Rejected for the reasons above; also `agent`-scoped REST routes would not let the vault write `position` or `section_id`.

**D2. CLI only; no server-side vault folder in v1.** The server would need a file watcher (fsnotify is a new dependency, about 100 KB, with platform code; polling on the server competes with the one writer), would hold plaintext for encrypted accounts (which the whole encryption design forbids), and a folder inside a container volume is not where Obsidian runs: it would still need a mount or a second sync tool. The CLI runs where the files and Obsidian are, and `ot encryption unlock` already puts the key there. A server-side folder stays a possible follow-up for operators who want a vault on a NAS; its only extra piece would be a poller on the jobs leader writing with device `vault:server`. Alternative: both in v1. Rejected: double the surface for the smaller audience.

**D3. File layout.** `Inbox.md`; `<name>.md` per top-level project; a project with live sub-projects becomes `<name>/<name>.md` (the Obsidian "folder note" convention, so the folder and its note share a name) with children inside. When a project gains its first sub-project the file moves into the new folder; when it loses the last one the folder collapses back. File names come from the project name with `/ \ : * ? " < > |` and control characters replaced by `-`, trailing dots and spaces trimmed, and a numeric suffix on a case-insensitive clash (`Home.md`, `Home 2.md`); the name in the app is never changed by the file system. Matching is by `opentodo-id` in the front matter, so renames and moves are cheap. A new `.md` file without `opentodo-id` is a new project; this is the documented contract of a vault folder ("every `.md` here is a project"), and the guide tells people to make the vault a sub-folder of their Obsidian vault, not the whole of it. Alternatives: `_index.md` folder notes (Obsidian's folder-note plugins differ; the same-name convention is the most common), matching by file name (breaks on rename), `.opentodo/map.json` for id to path (hidden state that drifts; the front matter travels with the file).

**D4. Task line format and the id.** Fields after the title in a fixed print order: `📅`, `[time:: ]`, `[tz:: ]`, `🛫` or `[someday:: true]`, `[deadline:: ]`, `[estimate:: ]`, `[evening:: true]`, priority marker, `🔁`, `#tags`, `⛔`, `➕`, `✅`, read-only fields, `🆔`. The id is the Obsidian Tasks `🆔` field holding OpenTodo's task id. Why `🆔` and not `[id:: ]` or an HTML comment: Tasks understands it natively, which makes `⛔` dependencies work inside Obsidian too (Tasks greys out blocked tasks), Dataview exposes it as `id` on the list item, and Tasks' own id characters (`[A-Za-z0-9_-]`) cover every id the clients make (UUIDs). An HTML comment is invisible in Obsidian's reading view but Tasks would not see it and Live Preview shows it as grey noise; `[id:: ]` works for Dataview only. The id is long; the vault accepts a line without one and writes it on the next sync, so typing a task in Obsidian stays cheap. Priority mapping: 1 `🔺`, 2 `⏫`, 3 `🔼`, 4 none; `🔽` and `⏬` read as 4 so a line written for Tasks' five levels still parses. `📅` is `due` (OpenTodo's do-on day, the API's name) because it is the field everybody types; the deadline is `[deadline:: ]`. `⏳` is left to the user and preserved as text (it is Tasks' "scheduled" and would be a second candidate for `due`; mapping both invites ambiguity).

**D5. Notes as an indented block.** The lines indented under a task line that are not task lines are the note, written as `description` (Markdown). The app's next open folds it into `notes_doc` (rich-text-editing, "Plain-text writes fold back"), and the projection it writes back is what the vault prints next time, so a round trip is stable after one app open. Alternative: one note file per task (`Home/notes/<id>.md`): keeps files short but scatters a project over dozens of files, and Obsidian Tasks would not show the note with the task. A note longer than 64 KB is refused by the value limit; the sync reports it.

**D6. State file and merge.** `.opentodo/state.json` holds `{device, profile, server, cursor, generation, clock, files: {path: {projectId, hash}}, base: {entity:id: {field: value}}}`. `base` is the last-synced value of every mapped field of every entity the vault wrote or read, and the merge is a three-way merge per field: file value versus base says "changed in the file", the ops pulled since the cursor say "changed in the app" (field-level, by entity and field name). Only a field changed on both sides is a conflict; it keeps the app's value and the file's line goes to `<file>.conflict.md` with a header line naming the field and the time. Base is updated after every successful exchange to the merged values. Unchanged files (hash equal to the last write) are skipped without parsing. The state file is written atomically (temp file and rename) after the exchange; a crash between push and state write is safe because the next run re-reads the same file diff against the old base and the server deduplicates op ids, which the vault derives from `(device, entity, field, base hash)` so a retried push carries the same ids. Alternative: no base, diff file against the pulled state only. Rejected: cannot tell which side changed a field, so every difference would be a conflict.

**D7. Conflict matrix.**

| Since the last sync | App: no change | App: other field changed | App: same field changed | App: trashed or purged |
| --- | --- | --- | --- | --- |
| File: unchanged | nothing | write file | write file | remove line |
| File: field changed | push | push and write (merge) | app wins; line to conflict file | remove line; line to conflict file |
| File: line removed | trash task | keep task, write line back, report | keep task, write line back, report | nothing |
| File: file deleted | write file back, report | write file back | write file back | remove line |
| App: project archived | remove file | rename `<name>.conflict.md` | rename `<name>.conflict.md` | remove file |

A line removed is a trash (`deleted_at`), restorable from the app's Trash; never a purge. A file deletion is never a project change, because deleting a note is a common accident in a folder sync and a trashed project would take its tasks with it.

**D8. Printing is deterministic and minimal.** The printer sorts tasks by `position` within a section, sections by `position`, and writes one space between fields; the parser accepts any spacing and order. A file is rewritten only when its printed bytes differ from the current bytes, and prose, unknown headings, non-task list items and unknown front-matter keys are carried from the parsed file into the printed one at their positions (task lines are replaced in place; new tasks from the app are appended at the end of their section; a new section from the app is appended after the last section). Positions: a moved line gets a position between its neighbours (midpoint, or neighbour plus 1,000 at the ends), so one move is one op.

**D9. Watch without a dependency.** `ot vault watch` opens `GET /api/v1/sync/events` for its device (stdlib HTTP, like `ot mcp` does for the server) and polls modification times of `*.md` under the vault every two seconds, syncing once a changed file has been stable for one second (editors write in steps). Alternative: `fsnotify`. Rejected: a dependency with per-platform code for a folder of at most a few hundred files, where a two-second stat walk costs nothing. Obsidian itself saves on a debounce, so sub-second latency buys nothing.

**D10. Encryption on the user's machine.** For an encrypted account (detected from the key record, as `ot encryption status` does), the vault opens every content envelope with `crypt.Open` and seals every content value it pushes with `crypt.Seal` bound to `(entity, id, field)`, exactly as `ot mcp --decrypt` does. The content fields are the list in `internal/e2ee.ContentFields` (title, description, origin, project, label and section names, custom field values). A value that fails to open prints as the app's encrypted placeholder and is marked read-only for that sync so it is never pushed back as plaintext. The state file holds plaintext base values, which is the same exposure as the vault's own files; `ot vault init` says so once, and the guide repeats the `ot encryption lock` advice from `mcp-projects`.

**D11. Package placement and size.** `internal/vault` holds the parser, the printer, the merge, the state file and the sync loop, with an interface for the HTTP calls so tests run against `httptest` and the fixture vault. It is imported by `internal/cli` only; a test asserts that the server binary's import graph does not contain it (as for `internal/e2ee/crypt`). Stdlib only (`bufio`, `regexp`, `encoding/json`, `crypto/sha256`, `os`, `path/filepath`). Estimated: `ot` grows by about 300 KB; the server binary, container image and runtime memory are unchanged. The vault's memory on the CLI is the account's mapped fields in Go maps: about 1 KB per task, so 20,000 tasks is about 20 MB.

**D12. Limits.** 1 MB per file, 5,000 task lines per file, 20,000 tasks per vault, 64 KB per note (the op value cap): checked before any write or push, so a sync either runs whole or changes nothing. The numbers keep a sync under a second on a laptop and a file openable in Obsidian; they are constants, not settings.

**D13. Interface budget.** No screen changes: nothing in `web/src` is touched. The only mention in the app is one line in Settings → Integrations → Command line (existing card) linking to the guide, which stays within the one-line card description rule of `settings-copy`.

## Risks / Trade-offs

- [Obsidian Tasks changes its format] → the fields used are its stable, documented ones; unknown text is preserved, so a new Tasks field never breaks a sync.
- [A whole Obsidian vault pointed at `ot vault init` creates a project per note] → `init` refuses a folder that already holds `.md` files unless `--adopt` is given, and the guide says to use a sub-folder.
- [Lossy by design: comments, attachments, time entries never reach the file] → stated in the guide and in the proposal; the own export stays the complete format.
- [Large accounts] → limits in D12, skipped unchanged files, one sync per change in watch mode.
- [Plaintext on disk for encrypted accounts] → owner-only state file (0600 and 0700, like the token and key), the init notice, `ot encryption lock`.
- [Two vaults of one account on one machine] → each has its own device id and state; they converge through the server like two devices.
- [Clock of the machine wrong] → the HLC follows `serverTime` and `clock_skew` refusals (D1).

## Migration Plan

Nothing to migrate: no server change, no schema change, no setting. Rollback is deleting the vault folder; the account is unchanged because every edit already synced is an ordinary op, and `ot vault init` can be run again later. A vault made with a newer `ot` that writes a field an older `ot` does not know keeps that text as unknown on the line.

## Open Questions

- Whether `ot vault init --adopt` should also accept an existing folder of plain checklists (files without ids) as the first import, or whether the guide should point to the importer for that. Default: `--adopt` treats them as new projects, which is what the contract says a `.md` file in a vault is.
- Whether `[field:<name>:: ]` custom field values should become writable in a follow-up once the choice and date validation in `internal/sync` is exposed to the CLI; today they are read-only (spec "What the file does not round-trip").
