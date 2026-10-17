# Reliable background jobs: clean shutdown, bounded disk use, safe mailbox handling

## Why

An integrations audit found that the server's background jobs are not reliable at the edges:

- **Shutdown (INT-6).** `tenant.StartJobs` starts the jobs with bare `go` statements and nothing waits for them; `main` closes the database while they run. A backup in progress is aborted with "database is closed", and a digest or reminder push that went out just before shutdown is not recorded (its outcome write uses the cancelled context), so it goes out again after the restart.
- **Backup disk use (INT-7).** A run writes the `VACUUM INTO` snapshot and the archive into `<data>/tmp` without checking free space, so a large database or attachment set can fill the disk the database lives on (every write then fails). Snapshots and archives left by a crash are never removed, which also leaves plaintext copies of the database behind. The local destination copies the archive a second time.
- **Restore extraction (INT-12).** A tar entry is copied with `io.Copy` and its size is compared with the manifest only afterwards, so a crafted or damaged archive can write far more than the manifest lists.
- **IMAP without UIDPLUS (INT-13).** After processing, the email poller sends a bare `EXPUNGE`, which also removes messages that another mail client flagged `\Deleted` in the same mailbox.
- **Reminder scan (INT-3).** The scheduler loads every overdue, undelivered reminder every 30 seconds without a limit; reminders of completed tasks are never delivered or dismissed, so the scan grows forever.
- **Notification retention (INT-19).** A self-hosted server sweeps read notifications past the 90-day retention only at start-up, and the three insert paths are copies of each other.

## What Changes

- `StartJobs` returns a stop function: it cancels the jobs and waits for every goroutine it started, plus the backup service's own (scheduler, restore housekeeping, a run started from the web app). `main` waits for it, at most 20 seconds (logged when exceeded), before closing the database; `Tenant.Close` stops the backup service first. Outcome writes after a send (digest sent, reminder delivered) use a context that survives cancellation.
- A backup checks free space before starting (snapshot plus archive, plus a 64 MiB margin; per filesystem when the local destination is on another one) and fails with "not enough free disk space for a backup". Leftover `tmp/snapshot-*`, `tmp/opentodo-*` and `.tmp-opentodo-*` files in the local destination are removed when the backup service starts. The local destination's archive is written in the destination directory and renamed into place, not staged in `<data>/tmp` and copied.
- Restore rejects a tar entry whose size differs from the manifest before copying it, copies at most the listed size (`io.CopyN`), and checks free space against the sum of the manifest's sizes before extracting anything.
- On an IMAP server without UIDPLUS, processed messages are left flagged `\Seen` and `\Deleted` (moved copies are in the processed folder); no bare `EXPUNGE` is sent. Documented in `docs/email.md`.
- The reminder scheduler records a reminder whose task is completed as dismissed (a server op), so it leaves the scan; the candidate query is read in pages of 500 with a keyset. Reminders on deleted tasks keep the Trash rule (nothing recorded).
- One insert helper for in-app notifications; a self-hosted server sweeps read notifications daily from `StartJobs` (hosts already do).

No new dependency, environment variable, route or op field. Shutdown can take up to 20 s longer when a job is mid-send.

## Capabilities

- `self-hosting`: graceful shutdown of background jobs (ADDED).
- `backups`: disk space and temporary files during a backup; restore extraction bounded by the manifest (ADDED).
- `email-capture`: processed messages on servers without UIDPLUS (ADDED).
- `reminders`: reminders of completed tasks are dismissed by the server (ADDED).
- `task-assignment`: read notifications are removed after 90 days (ADDED).
