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

### Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/healthz` | none | `{"status":"ok","version":"…"}` |
| GET | `/api/v1/auth/status` | none | `{setupRequired, signupAllowed, authenticated, user, version}` |
| POST | `/api/v1/auth/register` | none | `{email, name?, password}` → 201 `{user}` + cookie. First account becomes owner |
| POST | `/api/v1/auth/login` | none | `{email, password}` → `{user}` + cookie |
| POST | `/api/v1/auth/logout` | cookie | 204 |
| GET | `/api/v1/me` | yes | `{user}` |
| GET | `/api/v1/tokens` | yes | `{tokens:[{id,name,createdAt,lastUsedAt}]}` |
| POST | `/api/v1/tokens` | yes | `{name}` → 201 `{token, secret}` (secret shown once) |
| DELETE | `/api/v1/tokens/{id}` | yes | 204 |
| GET | `/api/v1/tasks` | yes | `{tasks:[…]}`; `?include_deleted=true` to include tombstones |
| POST | `/api/v1/tasks` | yes | create → 201 task |
| GET | `/api/v1/tasks/{id}` | yes | task or 404 |
| PATCH | `/api/v1/tasks/{id}` | yes | partial update → task |
| DELETE | `/api/v1/tasks/{id}` | yes | soft delete → 204 |
| GET/POST/GET/PATCH/DELETE | `/api/v1/projects…` | yes | same shape for projects |
| GET/POST/GET/PATCH/DELETE | `/api/v1/labels…` | yes | same shape for labels |
| POST | `/api/v1/sync` | yes | device sync, see `docs/sync.md` |
| GET | `/api/v1/export` | yes | full JSON export (`projects`, `tasks`, `labels`), including deleted items |

### Task fields

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | |
| `description` | string | |
| `project_id` | string or null | null = Inbox |
| `priority` | 1–4 | 1 highest, 4 default |
| `due` | `{date:"YYYY-MM-DD", time?:"HH:MM"}` or null | floating date |
| `labels` | string[] | ids of existing, non-deleted labels; replaced as a whole on PATCH |
| `position` | number | sort order inside a list |
| `completed_at`, `deleted_at` | unix ms or null | |
| `created_at` | unix ms | set by the server on create if missing |

### Project fields

`name` (string), `color` (string, CSS colour), `position` (number), `archived` (boolean), `parent_id` (string or null), `created_at`, `deleted_at`.

### Label fields

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | required on create, must not be blank; uniqueness is advisory (the app refuses duplicates per device, the API accepts them so merges stay possible) |
| `color` | string | CSS colour; picked from the palette when omitted on create |
| `position` | number | sidebar order; defaults to the creation time |
| `created_at`, `deleted_at` | unix ms (or null) | |

Tasks reference labels by id, so renaming a label is one PATCH and never rewrites tasks. Deleting a label through the API only sets its tombstone; tasks that still carry the id keep it (the app hides ids of deleted labels), and the app's own delete additionally removes the id from every carrying task.

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

## Behaviour notes

- Every write through this API is recorded in the operation log with server time, so connected devices see it on their next sync (within 30 s, or immediately when they next edit or regain focus).
- Writes to unknown fields or with wrong types are rejected as a whole; nothing is partially applied.
- Deletes are tombstones. Use `include_deleted=true` or the export to see them.
- Rate limits apply to `auth/login` and `auth/register` (10 per minute per IP).
