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
| GET | `/api/v1/auth/status` | none | `{setupRequired, signupAllowed, authenticated, user, version, passkeysAvailable}` |
| POST | `/api/v1/auth/register` | none | `{email, name?, password}` → 201 `{user}` + cookie. First account becomes owner |
| POST | `/api/v1/auth/login` | none | `{email, password}` → `{user}` + cookie |
| POST | `/api/v1/auth/passkey/options` | none | → `{publicKey}` sign-in options, see [Passkeys](#passkeys) |
| POST | `/api/v1/auth/passkey` | none | `{credential}` → `{user}` + cookie |
| POST | `/api/v1/auth/logout` | cookie | 204 |
| GET | `/api/v1/me` | yes | `{user}` |
| GET | `/api/v1/tokens` | yes | `{tokens:[{id,name,createdAt,lastUsedAt}]}` |
| POST | `/api/v1/tokens` | yes | `{name}` → 201 `{token, secret}` (secret shown once) |
| DELETE | `/api/v1/tokens/{id}` | yes | 204 |
| POST | `/api/v1/passkeys/register/options` | yes | → `{publicKey}` creation options |
| POST | `/api/v1/passkeys/register` | yes | `{name, credential}` → 201 `{passkey}` |
| GET | `/api/v1/passkeys` | yes | `{passkeys:[{id,name,createdAt,lastUsedAt,suspiciousAt,backedUp}]}` |
| PATCH | `/api/v1/passkeys/{id}` | yes | `{name}` → `{passkey}` |
| DELETE | `/api/v1/passkeys/{id}` | yes | 204 |
| GET | `/api/v1/tasks` | yes | `{tasks:[…]}`; `?include_deleted=true` to include tombstones |
| POST | `/api/v1/tasks` | yes | create → 201 task |
| GET | `/api/v1/tasks/{id}` | yes | task or 404 |
| PATCH | `/api/v1/tasks/{id}` | yes | partial update → task |
| DELETE | `/api/v1/tasks/{id}` | yes | soft delete → 204 |
| GET/POST/GET/PATCH/DELETE | `/api/v1/projects…` | yes | same shape for projects |
| POST | `/api/v1/sync` | yes | device sync, see `docs/sync.md` |
| GET | `/api/v1/export` | yes | full JSON export, including deleted items |

### Passkeys

Passkeys (WebAuthn) are an additional way to sign in; the password keeps working. They are only offered when `OPENTODO_BASE_URL` is `https://…` (or `http://localhost` / `127.0.0.1` for development). The relying-party id is the host of that URL and the expected origin is its `scheme://host[:port]`. `auth/status` reports `passkeysAvailable`. When it is `false`, every passkey route answers `409 passkeys_unavailable`.

Both ceremonies take two steps. The `options` route returns `{"publicKey": …}`, the JSON form of `PublicKeyCredentialCreationOptions` / `PublicKeyCredentialRequestOptions`, with a single-use challenge valid for five minutes. The browser runs `navigator.credentials.create()` or `get()` with those options, and the client posts the result back. **All binary fields are base64url strings** (padding optional), in the same shape that `PublicKeyCredential.toJSON()` produces:

```json
{
  "name": "Work laptop",
  "credential": {
    "id": "q2Xx…", "rawId": "q2Xx…", "type": "public-key",
    "response": {
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIi…",
      "attestationObject": "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVj…",
      "transports": ["internal", "hybrid"]
    }
  }
}
```

For sign-in, `response` carries `clientDataJSON`, `authenticatorData` and `signature`, and the body has no `name`. Sign-in uses discoverable credentials only (`allowCredentials` is empty), so the server finds the account from `rawId`. Registration asks for `residentKey: "required"`, `userVerification: "preferred"` and `attestation: "none"`. ES256, EdDSA (Ed25519) and RS256 keys are accepted.

| Code | Status | When |
| --- | --- | --- |
| `passkeys_unavailable` | 409 | the base URL is unset or not https/localhost |
| `passkey_challenge_invalid` | 400 | the challenge is expired, already used, issued to another account, or was a sign-in challenge used for registration (or the reverse) |
| `invalid_input` | 400 | origin, relying-party id, type or signature format does not match; credential already registered; empty name on rename |
| `bad_request` | 400 | a field is missing or is not base64url |
| `invalid_credentials` | 401 | sign-in with an unknown or deleted passkey, a bad signature, or a signature counter that went backwards (the passkey is then marked `suspiciousAt`) |
| `not_found` | 404 | rename or delete of a passkey id that is not yours |
| `rate_limited` | 429 | more than 10 requests per minute per address across `auth/login`, `auth/register` and both `auth/passkey` routes |

The anonymous `auth/passkey` routes apply the same `Origin` check as `auth/login`. A successful passkey sign-in sets the same `opentodo_session` cookie as a password sign-in. Bearer tokens can list, rename and delete passkeys, but a CLI cannot run a ceremony.

### Task fields

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | |
| `description` | string | |
| `project_id` | string or null | null = Inbox |
| `parent_id` | string or null | parent task for subtasks, any depth; see [Subtasks](#subtasks) |
| `priority` | 1–4 | 1 highest, 4 default |
| `due` | `{date:"YYYY-MM-DD", time?:"HH:MM"}` or null | floating date |
| `labels` | string[] | |
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

`name` (string), `color` (string, CSS colour), `position` (number), `archived` (boolean), `parent_id` (string or null), `created_at`, `deleted_at`.

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

Export everything:

```bash
curl -sS "$OT/api/v1/export" -H "Authorization: Bearer $TOKEN" -o opentodo-export.json
```

## Behaviour notes

- Every write through this API is recorded in the operation log with server time, so connected devices see it on their next sync (within 30 s, or immediately when they next edit or regain focus).
- Writes to unknown fields or with wrong types are rejected as a whole; nothing is partially applied.
- Deletes are tombstones. Use `include_deleted=true` or the export to see them.
- Rate limits apply to `auth/login`, `auth/register`, `auth/passkey/options` and `auth/passkey` (10 per minute per IP, one shared window).
