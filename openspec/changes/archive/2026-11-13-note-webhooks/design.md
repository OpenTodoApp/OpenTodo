# Design

## Context

`internal/webhook` derives events from committed batches: one event per entity per batch, coalesced by precedence (created, deleted, completed, reopened, archived, updated), queued durably in SQLite and sent by one worker with retries (`internal/deliveryq`). Task notes already travel as `description` in `task.updated`. Standalone notes (`note` entity, `standalone-notes`) are skipped on purpose. Unlike a task field, a note's text changes in a stream: the web app saves at every pause and syncs after 3 s of quiet (`notes-save-cadence`), so one sitting of writing is dozens of batches.

## Goals / Non-Goals

Goals: notes reach webhooks with the same signing, retries, filters and log as tasks; one sitting of writing is one delivery; nothing changes for webhooks that do not subscribe.

Non-goals: real-time collaboration feeds, per-keystroke events, diffs of the text, note links in the payload.

## Decisions

### D1. Event names follow the task events

`note.created`, `note.updated`, `note.deleted`, with the same precedence as tasks. The Trash is a tombstone, as for tasks, so "trashed" is `note.deleted` and a restore is `note.updated` with `changes.deleted_at`. Receivers that already handle `task.*` handle notes the same way.

Alternatives considered:
- **`note.trashed` / `note.restored`.** Clearer words, but a second vocabulary for the same tombstone; rejected for consistency with `task.deleted` and `project.deleted`.

### D2. A quiet window holds note events

Per webhook and note, the first event derived from a batch is written to a held-event row (`webhook_note_holds`: webhook, note, first event time, last change time, the name to send, the fields changed and their first `from` values). Each further batch for that note updates the row: the name stays `note.created` if it started so; `changes` keeps the first `from` and the latest `to`. The webhook job's next-due time includes the earliest release time, `min(last change + 5 min, first event + 30 min)`; at release the row becomes an ordinary queued delivery with the note's state at release, and the row is removed. `note.deleted` skips the hold, removes the note's row and is queued at once. A change that loses under last-writer-wins touches no row. Rows survive restarts (they are in the database); a held note deleted by purge is dropped with its row.

The window is a fixed server rule, not a setting: 5 minutes covers a pause in writing; 30 minutes bounds the delay for a note edited all afternoon.

Alternatives considered:
- **Send every batch.** Dozens of deliveries per note per sitting, each with half-written text; rejected.
- **Send only on leaving the note.** The server cannot see that; devices sync at different times and offline.
- **A per-webhook quiet setting.** One more field nobody tunes; rejected.

### D3. Payload without the editor document

`data.note` carries the Markdown projection `description`, never `notes_doc` (a binary merge state no receiver can read). `changes.description` is `{}`: sending the previous and the new text would double a 64 KB body for no use, and the state already has the new text. Titles and labels list `from` and `to`. The payload version is unchanged: a new event type in the same envelope.

### D4. Encrypted accounts

`title` and `description` travel as the stored ciphertext strings, exactly as task titles do today (`webhooks` "Payload and signature"), and the server reads nothing. The picker's Notes group says "Titles and text are encrypted" on such accounts (`e2ee.IsCiphertext` decides nothing here: the account's flag does). No placeholder or plaintext is ever produced.

### D5. Who receives which note

A webhook receives note events for notes its owner can read: their personal notes and notes of projects shared with them, as for tasks. The project filter matches a note whose `project_id` is the filter's project (or that moved into or out of it); a note without a project never matches a filtered webhook. Notes in the routines and agent paths carry `source` and `device` (`source: "rule"`, or `device: "agent:<token-id>"`), so a receiver can ignore its own writes.

### Data model

No op field or entity change. One new server-only table `webhook_note_holds` (migration `NNNN_webhook_note_holds.sql`), never synced, cleared with its webhook.

### Interface budget

The Webhooks settings section gains one group in the existing event picker; no row of chrome, no scroll region, no shortcut.

### Size

A few kilobytes in the server binary; no dependency; memory unchanged (holds live in SQLite).

## Risks / Trade-offs

- A receiver waits up to 5 minutes (at most 30) for a note change. Acceptable for notes; documented.
- A held event released after the webhook was disabled is dropped, like any queued delivery of a disabled webhook.
