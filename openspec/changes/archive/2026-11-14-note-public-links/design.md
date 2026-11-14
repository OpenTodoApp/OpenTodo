# Design

## Context

Task pages (`task-pages`) publish one task to `/t/<secret>`: server-side rows (never ops), a hashed secret, `GET /api/v1/pages/{secret}` without authentication, file downloads through the page, private headers, limits, a lifecycle re-check on every request and, for encrypted accounts, a device-made snapshot encrypted with a share key carried in the link's fragment. Standalone notes (`standalone-notes`) can be shared only through a shared project.

## Goals / Non-Goals

Goals: hand one note to someone without an account, read-only, revocable, on the same security model as task pages, with nothing new to learn.

Non-goals: guest replies or edits on notes; publishing task or project notes; a site of linked notes.

## Decisions

### D1. One page store, two kinds

The task page table gains `kind` (`task`|`note`) and `note_id`. Secrets, hashing, labels, expiry, revocation, snapshots and limits are shared code. `GET /api/v1/pages/{secret}` answers `kind` and the fields of that kind; a note page has `rights: "view"` only. The public address is `/n/<secret>[/<label>]` so a link reads as a note; `/t/<secret>` of a note page and `/n/<secret>` of a task page open the right layout (the secret decides).

Alternatives considered:
- **Separate tables and routes.** Rejected: duplicates the security-sensitive code for no difference in behaviour.
- **Publishing through a public project link.** Rejected: shares the whole project and shows tasks, not the note.

### D2. What a note page serves

Title, the note's Markdown projection, the last change time, and its live attachments (`note-attachments`): raster images on the inline allow-list served inline through `GET /api/v1/pages/{secret}/files/{fileId}` so embeds render, every other file as a download. Internal links `[text](?note=…)`, `?task=`, `?project=` are served with the target removed: the page shows the text the publisher wrote and no id. No labels, project, author email, account ids or Linked references.

### D3. Who may publish

A personal note: its author. A note of a shared project: the project's owner or admins (as task pages). Editors and viewers may not, so a member cannot expose a shared project's note alone.

### D4. Encrypted notes

As `task-pages` "Encrypted task pages": a random 256-bit share key, a snapshot of title, text and change time encrypted with it, the share key wrapped with the account key, the fragment never sent to the server; every unlocked, online device of the publisher re-uploads the snapshot within a minute of syncing an edit. Attachments are encrypted with the account key and are left out: the page says "Images and files are not shown on encrypted pages". Re-encrypting files for the page is left for later.

### D5. Lifecycle

Every request re-checks: revoked, expired, note in the Trash or purged, project deleted or archived, publisher deactivated or no longer allowed (moved into a project where they are not owner or admin) answer 404 `page_invalid`. A note moved across sharing scopes is copied and deleted, so its page goes invalid with the original; the dialog of a published note's move says so.

### D6. Interface

The menu entry and marker reuse the task panel's components; the marker sits in the note's header row (no new row). No new shortcut. The public page is outside the app.

### Data model

No op field. One migration adds `kind` and `note_id` to the page table (server state only).

### Size

No dependency. Public page bundle: a note layout using the existing Markdown renderer, a few KB gzip; app first load unchanged.

## Risks / Trade-offs

- The text a publisher wrote for an internal link (a title at the time of writing) is visible on the page. That is the publisher's own text; the dialog's notice says anyone with the link can read the note.
- A long note at 120 reads per minute per page is served from materialised rows; no extra cost per read beyond the Markdown strip.
