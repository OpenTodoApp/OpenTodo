# Tasks

## 1. Tooling

- [ ] 1.1 `internal/caldav/capture`: a `go run` command that turns a debug log of CalDAV request bodies into numbered, sanitised `.ics` fixtures (UID placeholders, neutral text for SUMMARY, DESCRIPTION, CATEGORIES and LOCATION, property names, parameters and dates kept); verify `go test ./internal/caldav/capture/...` on a sample log, plus a test that the package is not imported by `cmd/opentodo` (as for `internal/importer/sanitize`)
- [ ] 1.2 `docs/caldav-verification.md`: the scripted scenario, one numbered block per table column, including the new subtask hierarchy column, and how to send the result as a pull request (fixtures and row); verify `make docs-check`
- [ ] 1.3 Repository check in `scripts/repo-checks.test.mjs`: parse the tables in `docs/caldav.md` and `docs/calendar-sync.md`; fail when a row names no version or date, when a cell is blank, or, when `VERSION` is 1.0.0 or later, when a gated row has `not verified`; verify `make repo-check` with a sample table that fails and one that passes

## 2. Large-account tests

- [ ] 2.1 Use the deterministic 10,000-task fixture generator from `performance-10k` (`internal/perfseed`). If that change has not landed yet, add it here with the same API; verify the same seed yields the same op hashes twice
- [ ] 2.2 `internal/httpapi/caldav_large_test.go`: the five budgets of "Large-account budgets", printing the measured values and skipped under `-short`; verify `go test ./internal/httpapi -run Large` passes locally and fails when `sync-collection` is made to encode every task (a temporary local edit, not committed)
- [ ] 2.3 Subtask hierarchy tests: three levels in from a Tasks.org-shaped body, three levels served, a parent in another calendar kept in `ical_extra`, and a 401 without credentials; verify `go test ./internal/httpapi -run Subtask`

## 3. Real-client runs

- [ ] 3.1 Apple Reminders on iOS (current release) and macOS: run the script and capture fixtures into `internal/caldav/testdata/apple-reminders-ios-<v>/` and `-macos-<v>/`; pin them in `caldav_clients_test.go`; fill the rows. Verify `go test ./internal/httpapi -run Clients`
- [ ] 3.2 DAVx⁵ with Tasks.org and with jtx Board on Android: same steps; verify as in 3.1
- [ ] 3.3 Thunderbird (current ESR): re-run with the subtask column; verify as in 3.1
- [ ] 3.4 Mitra, if a device is available; otherwise leave the row as `not verified` with the date of the attempt (allowed by the gate)
- [ ] 3.5 Each defect found: open an issue, fill the cell with `defect #n`, and fix it in a separate small change that names the fixture

## 4. Calendar sync runs

- [ ] 4.1 iCloud, Fastmail, Nextcloud 30 and Google Calendar: connect, task to event, move or resize back, delete back, incremental sync; record the responses as `calsynctest` replay fixtures; verify `go test ./internal/calsync/...`
- [ ] 4.2 The verification table in `docs/calendar-sync.md`; verify `make docs-check` and `make repo-check`

## 5. Wrap-up

- [ ] 5.1 Comment the results on issue #9 and tick the three CalDAV boxes there
- [ ] 5.2 CHANGELOG entry under Unreleased ("CalDAV verified on Apple Reminders, DAVx⁵ and Thunderbird; calendar sync verified on iCloud, Fastmail, Nextcloud and Google"); verify `make docs-check`
- [ ] 5.3 `go test ./...` and `make check` (TZ=UTC) pass
