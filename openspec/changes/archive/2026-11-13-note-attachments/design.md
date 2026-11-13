# Design

## Context

Attachments (`attachments`) are metadata ops on the entity `attachment` with `task_id`, an optional `comment_id`, and bytes under `<data>/attachments/` served by `internal/blobs`. The scope of an attachment is its task's scope. Embedded images are references `attachment:<id>` that must name an attachment of the same task (`attachments` "Embedded attachments"). Standalone notes (`standalone-notes`) are their own entity with a project or the personal scope, and their editor hides the image command because there is no task to hang the file on.

## Goals / Non-Goals

Goals: a standalone note holds images and files exactly as a task does, with the same limits, permissions, offline queue and convergence; nothing new for the user to learn.

Non-goals: attachments on project notes; a file browser; sharing a file on its own.

## Decisions

### D1. One entity, a second parent

`attachment` gains `note_id` (`kNullableString`, default `null`). An attachment SHALL have exactly one parent: `task_id` non-empty and `note_id` null, or `task_id` empty and `note_id` set. `comment_id` is only allowed with a task. Parent fields stay immutable after creation, as today. The scope is the parent's scope; the server resolves it from the note when `note_id` is set.

Alternatives considered:
- **A separate `note_attachment` entity.** Rejected: it duplicates the upload, quota, retention and serving paths for no behavioural difference.
- **A hidden carrier task per note.** Rejected: a task that must never show in lists, counts or calendars contradicts "Note entity" and leaks into every task read.

### D2. Authorship and permissions follow the note

Anyone who may read the note may attach (viewers included, as for tasks); only the author renames; the author, project admins and the owner remove. For a personal note that is the note's author alone.

### D3. Moving a note across scopes

A note moved into a differently shared project is copied and the original deleted (`standalone-notes` "Notes follow their project"). The copy batch creates new attachment rows with the same `sha256`, size and type that name the original's stored file in a new immutable field `attachment.file_id`, so no bytes are copied and no upload is needed. The file store keeps keying files by attachment id: the content route and the export serve `file_id`'s file, a purge or the orphan sweep deletes a file only when no row has it as its id or `file_id`, and the quota counts a shared file once. The server accepts `file_id` only from an author who can see that attachment, for a file of its own (not a copy) with the same digest, and lets the device write the copy's `uploaded_at` only when that file is stored; a copy made before the original's upload is marked uploaded with it. Encrypted bytes are encrypted under the original's id, which a copy decrypts with. An encrypted file is not copied into a shared project (its members could not read it) and stays with the original in the Trash.

### D4. Conversions

**Turn into task** writes, in its batch, new attachment rows on the task for each of the note's live attachments (same file, as D3) and removes the note's rows; embeds in the text are rewritten to the new ids, and the new entity's document is rebuilt from that text. **Move note to a new note** does the reverse for attachments the task's note embeds; other task attachments stay on the task. One Undo reverses both.

### D5. Editor and view

The image command, paste and drop are enabled in the standalone note editor; the files list is the task panel's list component, shown below the note's text only when the note has attachments, so a note at rest gains no chrome. Interface budget: no row above the list, no scroll region (the list scrolls with the note), no new shortcut.

### Data model

Additive fields `attachment.note_id` and `attachment.file_id` in `internal/sync/ops.go` Schema (documented in its comment); regenerated `opSchema.ts`, `contentfields.go` unchanged (not content). Older clients keep the field and ignore rows whose task they do not have.

### Size

No dependency. Server code grows by the scope branch and two routes; the web change reuses lazy chunks.

## Risks / Trade-offs

- A shared stored file between a note copy and its original makes purging a reference count; the orphan sweep already tolerates rows that claim a file, so a missed decrement leaves a file at most until the sweep finds no row.
- Encrypted accounts: note attachments are encrypted on the device like task attachments; the server sees sizes only.
