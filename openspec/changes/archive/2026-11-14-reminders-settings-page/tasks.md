# Tasks

## 1. Rule

- [x] 1.1 Add vectors for a kind switch without an old default (both directions, with the D3 guards) to `web/src/lib/defaultReminder.vectors.json`; fix `web/src/lib/defaultReminder.ts` and `internal/defaultreminder`; verify `npm test` for the vectors and `go test ./internal/defaultreminder`
- [x] 1.2 Add a When control test: a day, then a time, with only the timed default set, adds one default reminder; verify it fails before the fix

## 2. Settings

- [x] 2.1 Add the Reminders page first in Notifications with Default reminders, remove them from Push notifications, point the settings search there; verify the settings tests and `make i18n-check`
- [x] 2.2 Update `docs/default-reminders.md`, `docs/settings.md` and `docs/notifications.md`; verify `make docs-check`

## 3. Release

- [x] 3.1 Add `changelog.d/Fixed/reminders-settings-page.md` and verify `make repo-check`
