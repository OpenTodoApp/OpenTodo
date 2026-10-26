# An entity id names one entity on the server

## Why

An internal security audit (2026-10-26, finding H1) found that the server looked up an existing entity only in the author's own personal scope and in project scopes. An id that existed only in another account's personal scope looked new. A member of a shared project who learned the id of someone's private task (task pages, public links, exports and CalDAV UIDs carry ids) could create a task with that id in a project shared with that person. From then on the owner's later edits to the private task were written into the shared project, and its members could delete or purge it. The same gap applied to sections, custom fields, comments, attachments and time entries, and to projects and automation rules in another account's personal scope.

Two related findings are fixed in the same area: CalDAV resource names were shared by every account (L9), and a project's `workspace_id` could name a workspace its author does not belong to and was read from any copy of the project (L10).

## What Changes

- The ids of projects, tasks, sections, custom fields, comments, attachments, time entries and automation rules are unique on the server. An operation for an id that exists goes to the scope where the entity lives, with the author's permission checked there. An operation for an id that exists only where the author cannot see it is refused with reason `forbidden`, exactly like any other write the author may not make; nothing is created and no value is handed back.
- A batch that places a stored task, section or custom field in another scope through its `project_id` (a device that derived an id, such as a recurring occurrence's, that already names an entity elsewhere) has every operation for that entity refused with `scope_change`, not only the `project_id` one.
- Labels, saved views, reminders, places, reviews and preferences stay per account: they never leave their author's personal scope, and `project_prefs` is keyed by a project id on purpose.
- Data written before this change can still hold one id in several scopes. The entity then belongs to the copy with the earliest operation the reader can see; a younger visible copy in a scope that shares a member with an older hidden copy is refused for writes (a squat on that member's data). A purge of one copy no longer removes reminders that another account keeps on its own copy. No data is rewritten.
- CalDAV resource names and UIDs that a client chose are kept per account; one account's client can no longer rename or drop another account's names. A migration keeps each existing row for every account that can see its task.
- A project's `workspace_id` must name a workspace the author belongs to (or their default workspace), otherwise the operation is refused with `forbidden`. The server reads a project's workspace from the project's own record only.

Not **BREAKING**: no op field changes. Clients already handle `forbidden` and `scope_change` refusals. A plain import of an export or template file whose ids are already used by another account now reports those rows as refused; "From a template" (fresh ids) is unaffected.

Out of scope: rewriting or removing copies that an earlier squat left in the database; remapping ids in the importer.

## Impact

- `internal/sync`: `idhome.go` (new), `scope.go`, `comments.go`, `attachments.go`, `timeentries.go`, `service.go` (`Get`, `List`), `trash.go` (`locate`, reminder cascade), `grants.go` and `workspaces.go` (workspace reads and the write check).
- `internal/sync/recurring.go` and `internal/email/process.go`: tasks with derived ids always carry `project_id`.
- `internal/httpapi/caldav_dav.go`, `caldav_write.go`; migration `0048_caldav_resources_per_account.sql`.
- Every write path goes through the resolver, so the rule covers `/api/v1/sync` and every `ApplyStrict` caller (REST, CalDAV, the importer, MCP and agent tools, calendar sync, issues, email, rules, public pages).
- CHANGELOG `Security`.
