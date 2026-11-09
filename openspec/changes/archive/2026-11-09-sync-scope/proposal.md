# Proposal

## Why

With a Personal and a Work workspace, calendar sync and CalDAV cover the whole account: work tasks end up in the personal calendar, and a phone's Reminders app shows every list of every workspace ([#1006](https://github.com/OpenTodoApp/OpenTodo/issues/1006)). People want one connection per workspace, and CalDAV users want to include or exclude single projects.

## What Changes

- Each calendar sync connection and each CalDAV app password gets a **scope**: `all` (today's behaviour and the default), `only` the chosen workspaces, projects and Inboxes, or everything `except` them. A workspace covers its projects and its Inbox, a project its sub-projects, an Inbox the tasks without a project of one workspace.
- Calendar sync writes only tasks in the scope. The next cycle after a change removes the events the connection wrote for tasks that left it (never any other event) and ignores calendar changes to their events.
- CalDAV lists only the calendars in the app password's scope; the others answer as unknown calendars (404, PUT 409), a VTODO with the UID of a task outside the scope never moves or changes it, and `MKCALENDAR` creates the project inside the scope or is refused. A task moving out of a calendar is reported removed by `sync-collection`, also when it moves between workspace Inboxes (missing until now).
- REST: `scope` on `GET`/`PATCH /api/v1/calendar-sync/connections`, on `GET`/`POST /api/v1/app-passwords`, and a new `PATCH /api/v1/app-passwords/{id}` (recent sign-in or admin token, denied on the demo).
- Settings: one control, **Tasks from** in a connection's Calendars dialog and **Lists** for an app password: All, Only these or All except these, with a picker of workspaces, projects and Inboxes.

No new environment variable. No op or op-schema change: a scope is server configuration in two new side tables (`calsync_scopes`, `app_password_scopes`); a connection or password without a row keeps meaning "all". Not **BREAKING**.

## Capabilities

### Modified Capabilities

- `calendar-sync`: a new requirement "Connection scope" limits the tasks written and the changes read back to the connection's scope.
- `caldav-sync`: a new requirement "App password scope" limits the calendars served to the password's scope and reports tasks leaving a calendar, also between workspace Inboxes, as removed.

## Impact

- New leaf package `internal/syncscope`; migration `0063_sync_scope.sql`.
- `internal/calsync` (connection, store, cycle, observer), `internal/auth/apppasswords.go`, `internal/httpapi/davroutes` (view, writes, feed), `internal/httpapi/caldav.go`, `internal/httpapi/calsync*.go`, the API surface fixture.
- `web/src/app/CaldavPanel.tsx`, `web/src/app/CalendarSyncDialogs.tsx`, a new `web/src/app/SyncScopeField.tsx`, `web/src/lib/api.ts`, `web/src/lib/types.ts`, the catalogues.
- `docs/api.md`, `docs/caldav.md`, `docs/calendar-sync.md`.

Out of scope: a scope for the read-only calendar feed (`/api/v1/calendar-feed`), for the MCP server or API tokens, and per-scope sync tokens for CalDAV. Auditing an app password's scope change (connections record it in `calendar_connection.updated`). Advances no open ROADMAP item.
