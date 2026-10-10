# Proposal

## Why

Task notes are a single plain-text field under field-level last-writer-wins. That is the right rule for a title or a priority, but for prose it is lossy: when a laptop and a phone both touch the same note while offline, one device's paragraph silently disappears on sync. Notes are also where people want structure: a checklist of steps, a link, a heading, bold text. The roadmap's comments and shared projects will multiply both problems, because two people editing one note is the normal case there, not an edge case.

The op log and the sync exchange are the right transport; what is missing is a value type for text that merges instead of overwriting, and an editor that speaks it.

## What Changes

- Task notes become a rich-text document (paragraphs, headings, bold, italic, strikethrough, inline code, links, bullet, numbered and check lists) edited in the detail panel with keyboard-first shortcuts and Markdown-style input rules.
- A new, additive task field `notes_doc` holds the note as an encoded text CRDT document, stored as an ordinary op value. Concurrent edits from any number of devices merge character by character; devices that receive a newer document merge it with their own and republish the union, so every device and the server converge on a document containing everyone's edits.
- The existing `description` field is kept, unchanged in meaning, as the plain-text projection of the document in Markdown. The client writes it in the same mutation as `notes_doc`, so the REST API, the export, older clients, the task list preview and future integrations keep seeing readable text with no change on their side. A plain-text write to `description` (REST, an older client) is folded back into the document.
- The editor and CRDT code load lazily when the detail panel first opens, so the initial bundle is not affected; size impact is recorded in design.md.
- Live co-editing uses the `realtime-sync-channel` wake-ups when available; without them, merging still happens on the normal sync schedule.

Out of scope: comments themselves (`comments-and-activity` will reuse the `rich-text-editing` capability and the same document encoding for a `body_doc` field); images and attachments; tables; presence (remote carets, "who is typing"); rich text in titles or project descriptions; a server-side renderer for HTML; sharing documents between users (`project-sharing`); end-to-end encryption (`e2ee`, which this design keeps possible because the server never interprets the document).

This change advances ROADMAP.md section 1, "Rich text with collaborative editing for notes and comments" (`collaborative-rich-text`), and prepares section 5 (`comments-and-activity`).

No new mandatory environment variable. The op log format is extended additively (one new field with one new value kind and a larger per-field size cap); nothing renamed or removed. Not **BREAKING**: clients and scripts that know only `description` continue to work and keep seeing and setting readable text.

## Capabilities

### New Capabilities
- `rich-text-editing`: the rich-text document model and editor for text fields: formatting set and keyboard access, the collaborative document stored as an op value, merge-and-republish convergence, the Markdown plain-text projection, folding plain-text writes back into the document, size limits, behavior while remote edits arrive, and compatibility with clients that only know the plain field.

### Modified Capabilities
- none. `task-management`'s "Task fields" contract is unchanged: `description` keeps its meaning and defaults; `notes_doc` is an additional field defined by the new capability, following the same pattern as the reserved `parent_id` and `labels` fields that are stored and synced before a client offers an interface for them.

## Impact

- Server: `internal/sync/ops.go` `Schema` gains `task.notes_doc` with a new opaque-document kind (base64 string, own size cap); REST create/patch accept and return it; export includes it. No server-side CRDT, no Go dependency, no migration (fields are rows, not columns).
- Client: `web/src/lib/types.ts` and `web/src/lib/ops.ts` defaults gain `notes_doc`; a new `web/src/lib/richtext.ts` (document encode/decode/merge, Markdown projection and parsing, republish rule); `TaskDetail` swaps the textarea for the lazily loaded editor; outbox coalescing for same-field document ops.
- New client dependencies: a text CRDT library and a rich-text editor core (named and sized in design.md); lazily loaded.
- Docs: `docs/sync.md` (schema table and "Mergeable documents" section), `docs/api.md` (`notes_doc` on tasks, Markdown semantics of `description`), `docs/architecture.md`, `README.md`, `CHANGELOG.md`.
