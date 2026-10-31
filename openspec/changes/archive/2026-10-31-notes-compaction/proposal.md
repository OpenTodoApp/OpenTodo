# Compact superseded note history

## Why

A note is stored as a **full-state document**: every save of a task's or a project's note writes a new `notes_doc` op holding the whole Yjs state (`ydoc:v1:<base64>`, up to 256 KB), plus its Markdown projection in `description` (up to 64 KB) in the same batch (docs/sync.md "Mergeable documents"). The op log only grows, and `Pull` serves every op after the cursor, so a new device downloads every superseded copy too. A 10 KB note edited 300 times is about 4 MB of log for 14 KB of current value; 500 such notes are about 2 GB. That is the database a Raspberry Pi has to hold, back up and serve, and the first pull a phone has to make. The owner decided (DECISIONS.md, "Notes storage safety", 2026-10-31) that before notes grow into a feature of their own the server must stop keeping every superseded copy.

Deleting a superseded value is not new: `PurgeSupersededContent` (OpenSpec `end-to-end-encryption`, `internal/sync/e2ee.go`) already removes every non-winning op of the content fields of a personal scope when encryption is turned on, and Purge removes whole entities. This change applies the same rule to note documents on a schedule, everywhere, after a grace window.

## What Changes

- A new background job **compaction** (`internal/tenant/jobs.go`, OpenSpec `one-job-model`) runs at most once a day and only after something changed since its last run. It:
  - deletes every **superseded** `notes_doc` op (task, project, and any later entity listed in `sync.DocFields`) that the server **received more than 30 days ago**, in every scope, shared projects included;
  - **thins** superseded `description` ops of the same entities received more than 30 days ago to the **last one per UTC calendar day** of the op's timestamp, so the History tab still shows one readable revision per day;
  - never deletes the current winner of a field, never deletes an op received in the last 30 days, and never deletes any other field's ops;
  - works in small transactions and yields between them, so sync writes are never held up for more than a moment;
  - returns the freed pages to the file system with **incremental vacuum**.
- **Incremental vacuum** needs SQLite's `auto_vacuum = INCREMENTAL`, which OpenTodo never set (the default is `NONE`). New databases get it before their first table; an existing database is converted once by a full `VACUUM`, run by the job at a quiet moment, with its cost and disk-space need stated in the log and in the docs.
- **Reporting.** Each run logs ops removed, value bytes removed and file bytes reclaimed. The last run is kept in the `settings` table and shown to the owner in a **Database storage** card on Settings › Server › Backups (database size, free space inside the file, last compaction and what it freed, conversion state), read through a new owner-only route `GET /api/v1/settings/storage`.
- **History** keeps one revision per day for notes older than 30 days; the History tab says so in one line above the older revisions.
- Docs: docs/sync.md gains a "Compaction" section beside "Purge"; docs/backups.md and the self-hosting guide get the one-time conversion note.

Not **BREAKING**: no op format change, no new environment variable, no change to the sync request or response. Cursors stay valid because sequence numbers are never reused (as after a purge).

## Out of scope

- Compacting any other field (titles, due dates, labels). Their values are small; the log stays the audit trail for them.
- Lazy note bodies on devices (`notes-on-demand`), which the owner deferred until the notes budgets of `performance-10k` show phones need it.
- A setting for the 30-day window or for turning compaction off.
- Securely erasing old values (`secure_delete`): compaction saves space, it is not a privacy feature; Purge and the encryption purge keep their own guarantees. Earlier backups keep the history they hold.
- Changing the client: devices keep no op history, so nothing changes on them.

## Roadmap

Advances milestone 0.19 "Series and time", item `notes-compaction` (the first of the notes changes: compaction → save cadence → desktop toolbar → notes overview). GitHub issue: [#652](https://github.com/OpenTodoApp/OpenTodo/issues/652).

## Capabilities

### New Capabilities

- `op-log-compaction`: which ops the server deletes and when, the grace window, the daily thinning of note revisions, incremental vacuum and the one-time conversion, the report and the owner's Database storage card and its route.

### Modified Capabilities

- `trash-and-history`: MODIFIED "Revision history": operations removed by compaction are no longer listed, and the History tab says older note versions are kept one per day.

## Impact

- **Server:** `internal/sync` (a `CompactNotes` pass beside `PurgeSupersededContent`, sharing its "superseded" query), `internal/store` (`auto_vacuum` on new databases, the conversion helper, `IncrementalVacuum`), `internal/jobs` (job name `compaction`), `internal/tenant/jobs.go` (the job), `internal/httpapi` (the storage route, `demo.go` deny list), `internal/settings` (the stored report).
- **Web:** the Database storage card (Settings › Server › Backups), the History tab's one-per-day line; strings in six languages.
- **Data model:** no op schema change; one `settings` key `compaction.last`; the database's `auto_vacuum` mode.
- **Size:** no dependency; binary growth negligible; bundle growth under 1 KB gzip (the card is on a lazy settings page).
