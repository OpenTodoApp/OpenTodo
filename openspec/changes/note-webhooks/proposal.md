# Proposal

## Why

Webhooks report tasks, comments and projects, but a standalone note never leaves the app: `standalone-notes` "Integrations that leave notes out" names webhooks explicitly. People who keep meeting notes, recipes or a reading log in OpenTodo cannot post a finished note to a chat, file it in a wiki, or start an n8n flow when a note is labelled `publish`. flatnotes and most note apps offer an API to poll; OpenTodo already has a signed, retried push channel, and notes should use it on request.

## What Changes

- **Three note events** a webhook can subscribe to: `note.created`, `note.updated` and `note.deleted` (the note gets a tombstone, which is how it goes to the Trash), named like the task events. Restoring a note from the Trash is a `note.updated` whose `changes` lists `deleted_at`.
- **Quiet before sending.** A note is saved every few seconds while someone types. Note events are held until the note has had no winning change for 5 minutes (at most 30 minutes after the first unsent change), then sent as one delivery carrying every change since the last one. A note created and written in one sitting is one `note.created` with its final text. `note.deleted` is sent at once and drops a held event of that note.
- **Payload** `data.note`: `id`, `title`, `description` (the note's Markdown), `project_id`, `labels`, `workspace_id`, `created_at`, `updated_at`, `deleted_at`; never the editor document. `changes` lists the changed fields with `from` and `to`, except `description`, which is listed without values (the state carries the text). Encrypted accounts get `title` and `description` as the stored ciphertext strings, like task fields, and the Webhooks screen says so beside the note events.
- **Same rules as other events.** Opt-in per webhook (existing webhooks gain nothing), the project filter matches the note's project, notes of shared projects reach the webhooks of members who can read them, import writes produce no note events, routine and agent writes carry their `source` and `device`, signatures, retries, the delivery log and private-network protection unchanged.
- The Webhooks screen's event picker gains a **Notes** group.
- `standalone-notes` "Integrations that leave notes out" no longer lists webhooks.

No new route, op field, dependency or environment variable. Not **BREAKING**: event names are additive and existing webhooks keep their subscriptions.

Archive order: after `notes-in-routines`, before `vault-notes` (the three edit "Integrations that leave notes out" in turn).

Out of scope: task notes and project notes as note events (they already travel in `task.updated` and `project.updated` as `description`); the activity feed; note links in the payload; an event per keystroke; a pull API beyond `GET /api/v1/notes`.

Roadmap: the "Notes area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `webhooks`: note events, their quiet window and payload.
- `standalone-notes`: webhooks leave the list of integrations that leave notes out.

## Impact

- Server: `internal/webhook` (event derivation for the `note` entity, a held-event table and its release, the payload), a new held-event release in the existing webhook job of `internal/tenant/jobs.go` (no new goroutine), event names in the webhook validation; a migration for the held events (`internal/store/migrations`).
- Web: the event picker in the Webhooks settings section (a Notes group), strings in every catalog.
- Docs: `docs/webhooks.md` (events table, payload example, the quiet window), `docs/notes.md` (the integrations sentence), `docs/api.md` event list.
- Size: a few kilobytes of Go; nothing on the web app's first load (the settings section is lazy).
