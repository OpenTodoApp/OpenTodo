# Proposal

## Why

Once a project is shared, the task itself is no longer enough: people need to discuss it in place and to see who changed what. The op log already records every change with its author and time, but nothing exposes it, and there is nowhere to leave a note for another member. This change adds threaded comments as a first-class synced entity and turns the existing op log into a readable activity history, both per task and per project, without adding a second source of truth.

## What Changes

- Threaded markdown comments on tasks: a new `comment` entity in the op log with a body, an optional parent comment, an author, edit and delete times, and mentions. Comments sync like tasks, work offline, and converge by last-writer-wins per field.
- Authors can edit and delete their own comments; project admins and the owner can delete any comment in their project. The server enforces authorship and project role per operation at receipt time, reusing the rejection channel from `project-sharing`.
- `@mentions` of project members, validated server-side, delivered through the notification hook from `task-assignment`.
- An activity log derived from the op log: human-readable events ("Alice completed 'Buy milk'", "Bob moved the due date to Friday", "Carol commented") per task and per project, served by REST and built locally on each device from the ops it already receives, so it works offline.
- Served ops gain an additive `actor` field (the author's account id, stamped by the server) so devices can attribute changes; client-supplied values are ignored.

Depends on `project-sharing` (scopes, membership, per-op rejection) and `task-assignment` (notification hook, used for mentions). Comments on personal tasks work without any sharing.

Out of scope: rich text or collaborative editing of comment bodies (`collaborative-rich-text`), attachments, reactions, comments on projects, the live cross-project feed and unread markers (`activity-feed`), revision restore from history (`trash-and-history`), an administrative audit log (`audit-log`).

Advances ROADMAP.md section 5 "Threaded markdown comments and activity log" (`comments-and-activity`).

No new environment variables. Op log change is additive only (new entity `comment`, new optional response field `actor`), not **BREAKING**.

## Capabilities

### New Capabilities
- `comments`: the comment entity, threading, authorship rules, edit and delete, mentions, markdown rendering, offline behaviour.
- `activity-log`: how changes are turned into attributed events, where they are shown, offline availability and the REST routes that serve them.

### Modified Capabilities
- none.

## Impact

- Server: `comment` in the op schema with authorship and role checks; `actor` on served ops; activity derivation in a new `internal/activity` package reading `ops`; routes `GET /api/v1/tasks/{id}/comments`, `GET /api/v1/tasks/{id}/activity`, `GET /api/v1/projects/{id}/activity`.
- Client: `comments` and `activity` tables in the local database, comment thread and activity panel in task detail, project activity tab, markdown rendering with sanitisation.
- Dependencies: one small markdown renderer on the client (budget 10 KB gzipped, see design); none on the server.
- Docs: `docs/sync.md` (entity, `actor`), `docs/api.md`.
