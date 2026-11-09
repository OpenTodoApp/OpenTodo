# Tasks

## 1. Scope and storage

- [x] 1.1 `internal/syncscope`: the scope, normalization, the stored form and `Includes`. Verified by `go test ./internal/syncscope/`.
- [x] 1.2 Migration `0063_sync_scope.sql`: side tables `calsync_scopes` and `app_password_scopes`, no row meaning all. Verified by `go test ./internal/store/` and the stored scopes read back in the tests below.

## 2. Calendar sync

- [x] 2.1 The connection carries its scope; `Patch.Scope` stores it and makes the connection due; the cycle asks for the feed in the scope; the observer wakes on workspace and project moves. Verified by `go test ./internal/calsync/ -run Scope` (push filtered, narrowing removes only own events and widening writes them again, calendar changes to tasks outside the scope ignored).
- [x] 2.2 `davroutes.FeedTasksIn` resolves the scope like CalDAV; `PATCH /api/v1/calendar-sync/connections/{id}` accepts `scope`, refuses invalid ones, audits it. Verified by `go test ./internal/httpapi/ -run TestCalendarConnectionScope`.

## 3. CalDAV

- [x] 3.1 App passwords carry a scope (`POST` with `scope`, new `PATCH /api/v1/app-passwords/{id}` with the creation policy). Verified by `go test ./internal/httpapi/ -run 'TestCalDAVScoped|TestPolicy|TestDemo'` and `go test ./internal/auth/`.
- [x] 3.2 The view hides calendars outside the scope; UIDs, parents and blockers are limited to it; MKCALENDAR lands inside it or is refused; `sync-collection` reports workspace and parent moves as removed. Verified by `go test ./internal/httpapi/ -run 'TestCalDAVScopedAppPassword|TestCalDAVInboxMoveReported'` and the existing CalDAV tests.

## 4. Settings

- [x] 4.1 `SyncScopeField` (All · Only these · All except these, chips and a Combobox of workspaces, Inboxes and projects) in the Calendars dialog and the app password dialogs, with a Lists menu item and the scope on the password's row. Verified by `npx vitest run src/app/syncScopeField.test.tsx src/app/caldavSettings.test.tsx src/app/calendarSyncSettings.test.tsx` in `web/`, `npm run typecheck`, `npm run lint`, `make bundle-budget`.
- [x] 4.2 New strings in every shipped catalogue. Verified by `make i18n-check`.

## 5. Docs

- [x] 5.1 `docs/api.md` (routes and "Sync scope"), the API surface fixture, `docs/calendar-sync.md` ("Choose which tasks sync"), `docs/caldav.md` ("Choose which lists an app password syncs"). Verified by `go test ./internal/httpapi/ -run 'Surface|Docs'`, `make docs` and `make docs-check`.
