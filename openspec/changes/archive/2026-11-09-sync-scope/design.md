# Design

## Context

Calendar sync (`internal/calsync`) writes "the task feed's selection" (`davroutes.FeedTasks`: open, visible, dated tasks outside archived projects) into one calendar per connection, and reads back changes to the events it wrote (links in `calsync_links`). CalDAV (`internal/httpapi/davroutes`) serves one calendar per live project plus one Inbox per workspace (`inbox`, `inbox-<workspace id>`), with workspaces resolved by `opsync.Partition`. Neither has a notion of a part of the account. Connections and app passwords are server rows, never ops.

## Goals / Non-Goals

Goals: one connection or app password per workspace; including or excluding single projects; existing rows keep syncing everything; never delete an event OpenTodo did not create; one scope model for both features.

Non-goals: scoping the read-only feed, MCP or API tokens; filters by label or other task fields; per-scope sync tokens.

## Decisions

### D1. One scope shape, server configuration

`internal/syncscope.Scope{mode, workspaces, projects, inboxes}` with mode `all`, `only` or `except`. `Includes(Place)` takes a place: the workspace and, for a project, the project followed by its ancestors. Matching:

- a workspace id matches every place in that workspace (its projects and its Inbox);
- a project id matches the project and its sub-projects (the ancestor chain);
- an Inbox id (a workspace id) matches only that workspace's tasks without a project.

`only` keeps what matches, `except` what does not. The same shape serves both levels the issue asks for: "Work only" is `{only, workspaces:[work]}`, "everything but Clients" is `{except, projects:[clients]}`, "Garden and my personal Inbox" is `{only, projects:[garden], inboxes:[personal]}`.

Normalization: at most 200 ids of at most 64 characters, duplicates dropped; a scope with nothing chosen, or of mode `all`, is `all` with empty lists (so the UI can send what it has). Ids are not checked against the account: a scope only narrows what the credential reaches, and an unknown or deleted id matches nothing. Stored as JSON text, `''` for `all`.

Alternatives: an include list only (excluding a project would then mean listing every other one, and new projects would never be included); a separate exclude list beside an include list (two lists whose interaction needs explaining); a filter query (`internal/filter`) — far more than the issue needs, and filters change meaning with task fields while a calendar collection is a fixed place.

### D2. Inbox under a project-level scope

The Inbox is per workspace, so it is a place of its own: choosing a workspace includes its Inbox, choosing projects does not, and the picker offers each workspace's Inbox as a choice ("Inbox" in the default workspace, "Work · Inbox" elsewhere, the same names as the CalDAV lists). `except` a workspace leaves its Inbox out too.

### D3. Data model

Migration `0063_sync_scope.sql` adds two side tables, `calsync_scopes(connection_id, scope)` and `app_password_scopes(app_password_id, scope)`, each row deleted with its connection or password (`ON DELETE CASCADE`). A connection or password without a row covers the whole account, so existing rows keep their meaning, an older binary reads every row as it always did, and the migration is idempotent (`CREATE TABLE IF NOT EXISTS`, the convention of the side tables of API tokens) where an `ALTER TABLE … ADD COLUMN` would not be. Setting `all` deletes the row. No op field, no op-schema change, nothing synced or exported (connections and app passwords never were).

### D4. Calendar sync: the scope filters the push set

`Worker.Tasks` takes the connection's scope and the server answers with `davroutes.FeedTasksIn`, which loads the same view as CalDAV with the scope applied: a task is in the set when CalDAV would list its calendar under that scope. So both features resolve workspaces, sub-projects and Inboxes in one place.

Everything else follows from the cycle as it is:

- **Push** writes tasks in the set and removes the events of linked tasks that left it. Links exist only for events the connection created (`calsync_links`), so a scope change removes only those; the user's own events are never touched, whatever their UID. Removal is capped by `MaxWritesPerRun` like any other; a partial run comes back after the debounce.
- **Pull** applies changes only for linked tasks in the set: a changed event of a task outside it counts as a conflict the task wins (and push removes the event); a deleted one just forgets the link. So nothing outside the scope is accepted back.
- **New tasks from the calendar**: the cycle never creates tasks from events (calendar-sync "Events the server did not write SHALL never become tasks"), so no landing place is needed.
- A new scope makes the connection due at once (`Store.Update`), like a calendar choice. The observer also wakes connections for a task's `workspace_id`/`parent_id` and a project's `workspace_id`, `parent_id`, `archived` and `deleted_at`, which move tasks into or out of a scope.

The task's own data never changes because of a scope.

### D5. CalDAV: the scope hides calendars

`davAuth` returns the app password with its scope (`auth.AppPasswordUser`), and the per-request view applies it in `calendarVisible`: an Inbox or a project outside the scope is treated exactly like a calendar that does not exist. That one change gives:

- the calendar home lists only calendars in the scope;
- PROPFIND, GET, REPORT, DELETE and PROPPATCH on a calendar or resource outside it answer 404, PUT 409 (as for an unknown calendar), so nothing outside is read or written;
- `calendarOf` returns "" for a task outside the scope, so it is in no calendar's listing or query.

Tasks reached by UID across calendars (moves, parents, `DEPENDS-ON`) are limited to the scope (`taskByUID`). A parent or blocker outside the scope is not served (no `RELATED-TO` naming a task the client cannot see) and is kept on the next PUT instead of being cleared, since the client never saw it. A VTODO whose UID is the id of a task outside the scope creates a new task in the target calendar (with a fresh id, as for any taken id) and never moves the hidden one.

**Creating a task** through CalDAV always happens in a calendar the client can see, so it lands in the scope by construction: in that project, or that workspace's Inbox. **Creating a calendar** (MKCALENDAR) makes a project: under an `only` scope with workspaces it goes into the first chosen workspace the account has, otherwise into the default workspace; if the new project would still be outside the scope (only projects chosen, or the default workspace excluded), MKCALENDAR is refused with 403 `need-privileges`, since the client could never see the list it just made.

**Deletions in sync-collection.** Within a calendar, membership depends on the task's `project_id`, its `workspace_id` (Inbox) and, for subtasks in an Inbox, its `parent_id`. A token-based report already lists a task that changed `project_id` and is no longer in the calendar as 404; it now does the same for `workspace_id` and `parent_id`, which also fixes a task moved between workspace Inboxes staying in the old Inbox on the client. When a whole calendar leaves the scope (a scope change, or its project moving to a workspace outside it), the calendar disappears from the home listing and answers 404, which is how clients learn a collection is gone (as for an archived project today). The sync token stays the account's op cursor: a calendar entering the scope is new to the client, which starts it with an empty token.

### D6. REST

- `GET /api/v1/calendar-sync/connections` and every connection answer carry `scope`; `PATCH /api/v1/calendar-sync/connections/{id}` accepts it (same policy, `signedIn.DemoDenied()`), audited in `calendar_connection.updated` with `scope` among the changed settings.
- `GET /api/v1/app-passwords` lists `scope`; `POST` accepts an optional `scope`; the new `PATCH /api/v1/app-passwords/{id}` with `{scope}` uses the creation policy (`signedIn.Sensitive().DemoDenied()`: a recent sign-in or an admin token, refused on the demo, which the deny list already covers by its `/api/v1/app-passwords` prefix), since it changes what a credential reaches. A refused scope is 400 `invalid_input` with field `scope`; a foreign, unknown or revoked password 404. The scope change of an app password is not audited: it can only narrow or restore what the password reached at creation, which is.

### D7. Settings UI

One shared control, `SyncScopeField`: a segmented control **All · Only these · All except these** and, unless All, chips of the chosen places plus a multi-select Combobox of workspaces, Inboxes and projects (grouped by workspace, projects as a tree), the same chips-and-Combobox pattern the Calendars dialog uses for its calendars. No helper text. It reads workspaces and projects from the local database (`useWorkspaceState`, `useProjectsOfEveryWorkspace`), so it lists what the person sees in the sidebar; archived projects are not offered.

- Calendar sync: a **Tasks from** fieldset in the Calendars dialog, saved with the other choices.
- CalDAV: a **Lists** field in the New app password dialog, and a **Lists** item in each password's menu opening a small dialog with the same field. The password row's meta line names the scope when it is not All ("Work, Garden").

Interface budget (`docs/interface-guide.md`): settings dialogs only; no list chrome, task properties, sidebar destinations, scroll regions or shortcuts change. The control lives in the Settings chunk, which is loaded lazily, so the first-load bundle does not grow.

## Risks / Trade-offs

- **A scope change removes many events at once.** Removal is limited to `MaxWritesPerRun` per cycle and only touches linked events; a wide narrowing finishes over several cycles 20 seconds apart.
- **Hidden UIDs.** A client that kept a task's UID after it left the scope and PUTs it again creates a second task instead of reviving the hidden one. This is the safer outcome (nothing outside the scope changes) and matches how a UID taken by an invisible task is handled today.
- **Clients that cache collections.** Some clients keep a removed collection until their next home listing; writes to it then answer 409 and nothing changes.
- **Size and memory.** No dependency. The Go package is ~150 lines; the web control is in the lazily loaded Settings chunk.
