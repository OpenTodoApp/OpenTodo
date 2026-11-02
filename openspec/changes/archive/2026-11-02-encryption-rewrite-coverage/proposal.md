# Proposal

## Why

Turning on end-to-end encryption starts a job on the device that re-writes the user's existing content as ciphertext (`web/src/lib/e2eeSync.ts`, the migration job of design D7 of `e2ee`). The job walks a hand-kept list of entity kinds, and every kind added after the first release of encryption was left off it except `objective`. The content fields of those kinds come from `internal/sync/ops.go` `Schema` (`Content: true`, generated into `OP_CONTENT_FIELDS`), so new writes were encrypted at upload, but text that existed when the user turned encryption on stayed in plaintext on the server:

| Kind | Content fields | Missing since |
| --- | --- | --- |
| `time_entry` | `note` | 0.9.0 |
| `review` | `tomorrow_note` | 0.9.0 |
| `place` | `name`, `address`, `geo` | 0.10.0 |
| `rule` | `name` | 0.10.0 |
| `frame` | `title` | 0.18.0 |
| `slot` | `title` | 0.18.0 |
| `note` | `title`, `description`, `notes_doc`, `appends.<id>` | 0.19.0 |

The reverse job (turning encryption off) had the same gap, leaving those kinds as ciphertext. The command-line client has no re-write job (`ot encryption` only unlocks, locks and reports; `ot mcp --decrypt` seals each write it forwards, and the server refuses plaintext for the rest), so it has no such gap.

While checking which rows the job may re-write, a second fault showed up: the device decided that notes and time entries are always personal, but the server places a note with a project in its project's scope and a time entry in its task's scope. An encrypted account therefore encrypted notes and time entries of shared projects, which the project's other members could not read.

## What Changes

- The re-write job covers every entity kind that has content fields. A unit test compares its list with `OP_CONTENT_FIELDS` and `CONTENT_PREFIXES`, so a kind added later without joining the job fails `npm test`.
- Notes follow their project and time entries their task when the device decides whether content is personal, at upload and in the job. The job skips time entries of other people, as it skips their comments.
- A device remembers which kinds its last complete run covered. When that list is shorter than the current one, or the device never ran the job, and the account encrypts and the device is unlocked, the device runs the job once more at the end of its next complete exchange. Values the server already holds as ciphertext are skipped, so the run re-writes only leftover plaintext and is idempotent. The same run writes back as plaintext any ciphertext in a shared project. On a device that turned encryption off and still holds the key, it runs the decrypt job instead.
- CHANGELOG entry under Security naming the affected data and versions; `docs/e2ee.md` lists every encrypted kind and describes the catch-up.

Out of scope: the purge of superseded plaintext operations stays a user action (purging is documented as the step after enabling); backups made before the fix may still hold the text. No ROADMAP item: this is a fix to `e2ee`.

No new environment variable, dependency, route or op field. Not **BREAKING**.
