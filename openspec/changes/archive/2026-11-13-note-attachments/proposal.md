# Proposal

## Why

A standalone note cannot hold a picture. The editor hides images and the attachment list exists only on tasks, because an attachment belongs to a task (`attachments` "Attachment entity"). So a meeting note cannot keep the whiteboard photo, a recipe cannot keep its picture, and a packing list cannot keep the booking PDF. People keep a dummy task for the file or move the note to another app. Task notes and project notes already embed images; standalone notes are the odd one out.

## What Changes

- **An attachment can belong to a note.** The attachment entity gains an additive `note_id`: an attachment names exactly one task or one standalone note. A note's attachment lives in the note's scope (its project's, or the author's personal scope) and follows it when the note moves. Limits, quota, upload, download, safe serving, retention and the orphan sweep are the same as for task attachments; `internal/blobs` stores the bytes as before.
- **Images in standalone notes.** The editor of a standalone note offers images like task notes: the `/` menu's Image entry, paste and drop. An image is embedded by reference (`![name](attachment:<id>)`) to an attachment of the same note.
- **Files under the note.** Below a standalone note's text, an Attachments list appears once the note has one, with the task panel's rows (name, type, size, state, thumbnail; open, download, rename, remove). Attach from the note's menu, paste or drop.
- **Moving and converting.** Turning a note into a task moves its attachments to the new task in the same batch, and moving a task's note out into a new note moves the attachments its note embeds. A note moved into a differently shared project (copy and delete) copies attachment metadata, not bytes: the copy names the same stored file.
- **REST:** `GET|POST /api/v1/notes/{id}/attachments` as for tasks; the rename, remove and content routes are unchanged.
- Mentions and Make subtask are still not offered in standalone notes.

No new mandatory environment variable, no dependency. Not **BREAKING**: `note_id` is additive; an older client ignores attachments whose task it does not have.

Out of scope: attachments on project notes; a gallery of all files; showing note attachments in the vault (`vault-notes` writes only the Markdown); public note pages show the note's images through `note-public-links`.

Roadmap: the "Notes area" in ROADMAP.md, after `notes-space`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `attachments`: an attachment belongs to a task or to a standalone note; note attachments in the API, the note view and conversions.
- `standalone-notes`: the editor offers images ("Writing a standalone note").

## Impact

- Server: `internal/sync/ops.go` Schema (`attachment.note_id`), scope resolution and the attachment checks in `internal/sync`, `internal/httpapi` attachment routes (`/api/v1/notes/{id}/attachments`), the conversion batches, retention and quota queries keyed by note as well as task; regenerated `web/src/generated/opSchema.ts` and the contract fixture.
- Web: `web/src/lib/attachments.ts`, the attachment list component reused in the note view (`web/src/app/notes/`), the editor's image command enabled for notes, `web/src/lib/markdown.ts` embed resolution by note.
- Docs: `docs/attachments.md`, `docs/notes.md`.
- Size: no new code on the first load; the note view reuses the lazy attachment list (under 1 KB gzip of wiring). Binary size unchanged within noise.
