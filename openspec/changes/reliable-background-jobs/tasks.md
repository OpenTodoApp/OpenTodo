# Tasks

## 1. Shutdown (INT-6)
- [x] 1.1 `StartJobs` returns a stop function backed by a WaitGroup; jobs run through one spawn helper
- [x] 1.2 `backup.Service.Stop`: counts scheduler, housekeeping and `StartRun` goroutines; cancels a web-started run at shutdown; `Tenant.Close` calls it
- [x] 1.3 `main` waits for the jobs at most 20 s (logged) before closing the database; `runJobsWhenLeader` starts under its lock
- [x] 1.4 Digest outcome and reminder delivery writes use `context.WithoutCancel`
- [x] 1.5 Tests: stop waits for a running backup, no "database is closed" logged; digest and push outcomes recorded across a shutdown mid-send

## 2. Backup disk space and temp files (INT-7)
- [x] 2.1 Free-space check before a run (snapshot + archive + margin, per filesystem)
- [x] 2.2 Sweep stale snapshots and archive temp files at `Start`
- [x] 2.3 Local destination writes the archive in its directory and renames it
- [x] 2.4 Tests; docs/backups.md

## 3. Restore bounds (INT-12)
- [x] 3.1 Entry size must equal the manifest; `io.CopyN`; free space for the manifest's total before extracting
- [x] 3.2 Tests with crafted archives

## 4. IMAP without UIDPLUS (INT-13)
- [x] 4.1 No bare `EXPUNGE`; messages stay flagged `\Seen \Deleted`
- [x] 4.2 Test with the fake IMAP server; docs/email.md

## 5. Reminder scan (INT-3)
- [x] 5.1 Reminders of completed tasks recorded as dismissed by the server
- [x] 5.2 Candidates read in pages with a LIMIT and keyset
- [x] 5.3 Test with 1200 stale reminders; docs/reminders.md

## 6. Notifications (INT-19)
- [x] 6.1 One insert helper
- [x] 6.2 Daily sweep from `StartJobs`; test; docs/api.md

## 7. Changelog
- [x] 7.1 CHANGELOG lines
