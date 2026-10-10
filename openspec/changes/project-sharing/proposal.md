# Proposal

## Why

Today every account on a server is an island: the op log, the materialized state and every REST read are keyed by user, so two people who run one container for their household or small team cannot work on the same list. Sharing is the first collaboration feature and the one every later collaboration feature (assignees, comments, activity feeds) is built on, so the hard decision has to be made here: how ops for a shared project are scoped and authorized without breaking the convergence guarantees or the clients that already exist.

## What Changes

- A project owner can share a project with other accounts on the same server by exact email, with the roles `viewer`, `editor` and `admin`. Every project keeps exactly one `owner`.
- The shared project and its tasks sync to every member's devices and converge under the same field-level last-writer-wins rules; members edit offline and their edits merge like any other device's.
- Members can leave; admins and the owner can change roles and remove members; the owner can transfer ownership.
- Permissions are enforced on sync and on REST. Ops a member is not allowed to write are rejected individually (never the whole batch), evaluated against the membership at the moment the server receives them, so a member whose role changed while offline converges deterministically with everyone else.
- The sync protocol is extended additively: the request is unchanged; the response gains a per-op `rejected` list and the caller's current `memberships`. Old clients ignore the new fields and keep working for their personal data.
- Membership management routes under `/api/v1/projects/{id}/members`, all requiring authentication.

Out of scope (own changes): assignees (`task-assignment`), comments and activity (`comments-and-activity`, `activity-feed`), inviting people who do not yet have an account (`invitations`), sharing across servers or public read-only links, per-task sharing, sharing of the Inbox, nested shared projects (`project-hierarchy` will inherit a parent's sharing when it lands).

Advances ROADMAP.md section 5 "Share projects with roles (viewer, editor, admin)" (`project-sharing`).

No new environment variables. No breaking change to the op log: existing op fields are untouched, the sync request format is unchanged, and every addition to the response is optional. The database migration relabels existing rows with a personal scope but does not rewrite any op.

## Capabilities

### New Capabilities
- `project-sharing`: membership and roles on a project, what each role may do, how a shared project reaches and leaves a member's devices, deterministic handling of permission changes for offline members, owner transfer, membership routes.

### Modified Capabilities
- `offline-first-sync`: "Per-user isolation" becomes per-scope isolation (a user receives ops for their own data and for projects shared with them, nothing else); "Sync exchange" gains the catch-up behaviour for a newly joined project and the per-op rejection list. The cursor stays a single number.

## Impact

- Server: `internal/sync` learns about scopes and authorization; new `internal/store/migrations/0002_sharing.sql` (additive `scope_id` on `ops` and `fields`, new `project_members` table); new handlers in `internal/httpapi`; export includes shared projects.
- Client: membership cache in the local database, read-only rendering for viewers, share dialog, local purge when removed, rejection handling in the sync loop.
- Docs: `docs/sync.md` (scopes, rejections, catch-up), `docs/api.md` (membership routes).
- Dependencies: none added on either side.
