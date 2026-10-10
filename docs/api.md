# HTTP API

Base path: `/api/v1`. All requests and responses are JSON. Errors look like:

```json
{ "error": { "code": "invalid_input", "message": "task.priority must be an integer from 1 (highest) to 4 (lowest)" } }
```

## Authentication

Two options:

- **Session cookie** (the web app). Obtained from `auth/register` or `auth/login`. State-changing requests must come from the app's own origin.
- **Bearer token** (scripts, CLI). Create one in **Settings → API tokens** or via `POST /tokens`, then send `Authorization: Bearer ot_…`.

```bash
export OT=https://todo.example.com
export TOKEN=ot_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

If you would rather not hand-write requests, the [`ot` command-line client](cli.md) wraps this API and prints the same entity shapes with `--json`.

### How a non-browser client signs in

Bearer tokens are minted by a signed-in user, so a client that only has an email and a password goes through a short session, which is what `ot login` does:

1. `POST /api/v1/auth/login` with `{email, password}` → the `opentodo_session` cookie.
2. `POST /api/v1/tokens` with that cookie and `{"name":"cli@<hostname>"}` → `{token, secret}`. Send **no `Origin` header**: cookie-authenticated writes are refused when `Origin` is present and does not match the server, and accepted without it (browsers always send one, non-browser clients normally do not).
3. `POST /api/v1/auth/logout` with the cookie, then keep only the `secret` and use it as a bearer token. Bearer requests are not subject to the Origin check.

Login is rate limited (10 attempts per minute per address); a token created in Settings and passed to `ot auth set-token` skips the session entirely.

### Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/healthz` | none | `{"status":"ok","version":"…"}` |
| GET | `/api/v1/auth/status` | none | `{setupRequired, signupAllowed, authenticated, user, version}` |
| POST | `/api/v1/auth/register` | none | `{email, name?, password, invitation?}` → 201 `{user}` + cookie. First account becomes owner; afterwards an `invitation` secret admits one member while sign-up is closed |
| POST | `/api/v1/auth/login` | none | `{email, password}` → `{user}` + cookie |
| POST | `/api/v1/auth/logout` | cookie | 204 |
| GET | `/api/v1/me` | yes | `{user}` |
| GET | `/api/v1/tokens` | yes | `{tokens:[{id,name,createdAt,lastUsedAt}]}` |
| POST | `/api/v1/tokens` | yes | `{name}` → 201 `{token, secret}` (secret shown once) |
| DELETE | `/api/v1/tokens/{id}` | yes | 204 |
| GET | `/api/v1/invitations` | owner | `{invitations:[…]}`, see [Invitations](#invitations) |
| POST | `/api/v1/invitations` | owner | `{email?, expiresInHours?}` → 201 `{invitation, link}` (link shown once) |
| DELETE | `/api/v1/invitations/{id}` | owner | revoke a pending invitation → 204 |
| GET | `/api/v1/invitations/{token}` | none | preview `{inviterName, email, expiresAt}` or 404 `invitation_invalid` |
| GET | `/api/v1/tasks` | yes | `{tasks:[…]}`; `?include_deleted=true` to include tombstones |
| POST | `/api/v1/tasks` | yes | create → 201 task |
| GET | `/api/v1/tasks/{id}` | yes | task or 404 |
| PATCH | `/api/v1/tasks/{id}` | yes | partial update → task |
| DELETE | `/api/v1/tasks/{id}` | yes | soft delete → 204 |
| GET/POST/GET/PATCH/DELETE | `/api/v1/projects…` | yes | same shape for projects |
| GET/POST/GET/PATCH/DELETE | `/api/v1/labels…` | yes | same shape for labels |
| POST | `/api/v1/sync` | yes | device sync, see `docs/sync.md` |
| GET | `/api/v1/sync/events?device={id}` | yes | server-sent event stream; wakes the device when other devices or the API record operations, see `docs/sync.md` |
| GET | `/api/v1/export` | yes | full JSON export (`projects`, `tasks`, `labels`), including deleted items |

### Task fields

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | |
| `description` | string | |
| `project_id` | string or null | null = Inbox |
| `parent_id` | string or null | parent task for subtasks, any depth; see [Subtasks](#subtasks) |
| `priority` | 1–4 | 1 highest, 4 default |
| `due` | `{date:"YYYY-MM-DD", time?:"HH:MM"}` or null | floating date |
| `labels` | string[] | ids of existing, non-deleted labels; replaced as a whole on PATCH |
| `estimate_minutes` | integer 1–10080 or null | duration estimate in minutes; `0`, negatives, fractions and strings are rejected |
| `position` | number | sort order inside a list |
| `completed_at`, `deleted_at` | unix ms or null | |
| `created_at` | unix ms | set by the server on create if missing |

### Subtasks

A task becomes a subtask by setting `parent_id` to another task's id, to any depth. On `POST /tasks` and `PATCH /tasks/{id}` the server checks the value and answers `400 invalid_input` when:

- the parent does not exist or is deleted (`parent task not found`),
- the parent is in a different project than the task — the task's `project_id` after the write, so you can set both in one request (`parent must be in the same project`),
- the parent is the task itself or one of its descendants, which would form a cycle (`parent is a descendant of the task`).

`parent_id: null` detaches a task and is always accepted. Nothing changes on a rejected request. The sync endpoint never rejects an operation for tree reasons; see `docs/sync.md` for how clients converge.

The REST API writes exactly the fields you send. The cascades the web app performs (completing a parent completes its open descendants, deleting a parent tombstones the subtree, moving a parent moves the subtree) are ordinary per-task operations issued by the client; a script that wants the same result sends one request per task. A subtask whose parent is completed, deleted or missing is shown at the top level of its project by every client, so nothing becomes unreachable.

```bash
# Add a subtask under an existing task in the same project
curl -sS "$OT/api/v1/tasks" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Book hotel","project_id":"<project-id>","parent_id":"<parent-task-id>"}'
```

### Project fields

`name` (string), `color` (string, CSS colour), `position` (number, sort order among siblings), `archived` (boolean), `parent_id` (string or null, see [Sub-projects](#sub-projects)), `created_at`, `deleted_at`.

### Sub-projects

A project becomes a sub-project by setting `parent_id` to another project's id, to any depth. On `POST /projects` and `PATCH /projects/{id}` the server checks the value and answers `400 invalid_input` when:

- the parent does not exist or is deleted (`parent project not found`),
- the parent is the project itself or one of its descendants, which would form a cycle (`parent is a descendant of the project`).

`parent_id: null` moves a project to the top level and is always accepted. Nothing changes on a rejected request. The sync endpoint never rejects an operation for tree reasons; see `docs/sync.md` for how clients converge when two devices move projects into each other concurrently.

The REST API writes exactly the fields you send. The cascades the web app performs (archiving a project archives its descendants, deleting one moves its direct sub-projects to its own parent and its open tasks to the Inbox) are ordinary per-project operations issued by the client; a script that wants the same result sends one request per project. A sub-project whose parent is archived, deleted or missing is shown at the top level by every client, so nothing becomes unreachable.

```bash
# Create a sub-project, then move it to the top level
curl -sS "$OT/api/v1/projects" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Q4 launch","parent_id":"<parent-project-id>"}'
curl -sS -X PATCH "$OT/api/v1/projects/<id>" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"parent_id":null}'
```

### Label fields

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | required on create, must not be blank; uniqueness is advisory (the app refuses duplicates per device, the API accepts them so merges stay possible) |
| `color` | string | CSS colour; picked from the palette when omitted on create |
| `position` | number | sidebar order; defaults to the creation time |
| `created_at`, `deleted_at` | unix ms (or null) | |

Tasks reference labels by id, so renaming a label is one PATCH and never rewrites tasks. Deleting a label through the API only sets its tombstone; tasks that still carry the id keep it (the app hides ids of deleted labels), and the app's own delete additionally removes the id from every carrying task.

### Invitations

Invitations let the owner admit one person with one single-use, expiring link while sign-up stays closed. Only accounts with the `owner` role may create, list or revoke them; a member gets 403 `forbidden`. Invitations are server-side account data: they are never written to the op log and never sync to devices.

**Create** — `POST /api/v1/invitations` with an optional body:

| Field | Type | Notes |
| --- | --- | --- |
| `email` | string | Bind the invitation to one address (matched case-insensitively at acceptance) |
| `expiresInHours` | integer 1–720 | Default 168 (seven days) |

Response (201):

```json
{
  "invitation": {
    "id": "…", "status": "pending", "email": "friend@example.com", "role": "member",
    "createdBy": "<owner id>", "createdByName": "Owner",
    "createdAt": 1760000000000, "expiresAt": 1760604800000,
    "acceptedAt": null, "acceptedBy": null, "revokedAt": null
  },
  "link": "https://todo.example.com/invite/oti_…"
}
```

The `link` contains the secret and is returned exactly once; the server stores only a hash. The link uses `OPENTODO_BASE_URL` when set, otherwise the request's origin (honouring `X-Forwarded-Host` / `X-Forwarded-Proto`). Bad input (`expiresInHours` outside 1–720, a malformed `email`) is a 400 `invalid_input`. Creation is limited to 20 per hour per account (429 `rate_limited`).

**List** — `GET /api/v1/invitations` → `{invitations: [...]}` with the same shape as above, newest first. `status` is one of `pending`, `accepted`, `expired`, `revoked`; an accepted entry carries `acceptedBy: {id, email, name}`. Secrets and links never appear in the list.

**Revoke** — `DELETE /api/v1/invitations/{id}` → 204. An already accepted invitation answers 409 `invitation_spent`; an unknown id 404 `not_found`. Revoking an invitation that is already revoked or expired is a no-op 204.

**Preview** — `GET /api/v1/invitations/{token}` needs no authentication and returns `{inviterName, email, expiresAt}` (`email` is `null` for an open invitation). Unknown, expired, revoked and accepted tokens all return the same 404 `invitation_invalid`. Rate limited per client IP like sign-in.

**Accept** — `POST /api/v1/auth/register` with `invitation` set to the secret:

```bash
curl -sS "$OT/api/v1/auth/register" -H 'Content-Type: application/json' \
  -d '{"email":"friend@example.com","name":"Friend","password":"a long passphrase","invitation":"oti_…"}'
```

Creates a `member` account and starts a session even when `OPENTODO_ALLOW_SIGNUP` is false. The invitation is spent in the same transaction, so it can create at most one account; a second use returns 404 `invitation_invalid`. Errors: 403 `invitation_email_mismatch` when the invitation is bound to another address, 409 `email_taken`, 400 `invalid_input` for the password policy. In every error case the invitation stays pending.

## Examples

Create a task due tomorrow at 9:00 in a project:

```bash
curl -sS "$OT/api/v1/tasks" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Call the plumber","priority":2,"project_id":"<project-id>","due":{"date":"2026-10-11","time":"09:00"}}'
```

Complete it:

```bash
curl -sS -X PATCH "$OT/api/v1/tasks/<id>" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"completed_at\": $(date +%s000)}"
```

List open tasks in the Inbox with `jq`:

```bash
curl -sS "$OT/api/v1/tasks" -H "Authorization: Bearer $TOKEN" | jq '.tasks[] | select(.project_id == null and .completed_at == null) | .title'
```

Create a label, then tag a task with it:

```bash
LABEL=$(curl -sS "$OT/api/v1/labels" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"errand"}' | jq -r .id)
curl -sS -X PATCH "$OT/api/v1/tasks/<id>" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"labels\":[\"$LABEL\"]}"
```

A `labels` value containing an id that is not an existing, non-deleted label is rejected with 400 `invalid_input` and the task is unchanged.

Rename a label (one request, no task is touched):

```bash
curl -sS -X PATCH "$OT/api/v1/labels/$LABEL" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"errands"}'
```

Export everything:

```bash
curl -sS "$OT/api/v1/export" -H "Authorization: Bearer $TOKEN" -o opentodo-export.json
```

The export resolves label ids: `tasks[].labels` holds ids and the top-level `labels` array (including deleted labels) carries their names and colours.

Follow live updates (the response is a `text/event-stream` that stays open; `-N` disables curl's buffering):

```bash
curl -sSN "$OT/api/v1/sync/events?device=my-script" -H "Authorization: Bearer $TOKEN"
# : connected
# event: ops
# data: {"cursor":158}
# : ping
```

`device` is required (400 `bad_request` without it) and names the subscriber; operations pushed by that same device id through `POST /sync` do not wake it. Each `ops` event carries only the user's latest cursor; fetch the changes with a sync exchange or the REST reads.

## Behaviour notes

- Every write through this API is recorded in the operation log with server time. Connected devices are woken over the event stream and sync within a second or two; devices without a live stream pick the change up on their next poll (within 30 s), or immediately when they next edit or regain focus.
- Writes to unknown fields or with wrong types are rejected as a whole; nothing is partially applied.
- Deletes are tombstones. Use `include_deleted=true` or the export to see them.
- Rate limits apply to `auth/login`, `auth/register` and the invitation preview (10 per minute per IP), and to invitation creation (20 per hour per account).

### Error codes

| Code | Status | Where |
| --- | --- | --- |
| `unauthorized` | 401 | any protected route without a valid session or token |
| `forbidden` | 403 | invitation management by a non-owner |
| `bad_origin` | 403 | cookie-authenticated write from another origin |
| `signup_closed` | 403 | registration without an invitation while sign-up is closed |
| `invitation_email_mismatch` | 403 | registration email differs from the invitation's bound email |
| `invitation_invalid` | 404 | unknown, expired, revoked or already accepted invitation |
| `invitation_spent` | 409 | revoking an accepted invitation |
| `email_taken` | 409 | registration with an existing email |
| `invalid_input` | 400 | validation failure naming the field |
| `rate_limited` | 429 | too many attempts in the window |
