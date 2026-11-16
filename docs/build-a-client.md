---
title: Build your own OpenTodo client
summary: Build a third-party OpenTodo client: REST only, push-only sync or full offline, covering tokens, idempotency, device ids, the outbox and rate limits.
audience: developer
section: Integrations
specs: []
screens: []
order: 30
---
# Build your own OpenTodo client

A third-party client talks to one OpenTodo server, the user's own or one they were invited to, over the same `/api/v1` HTTP API the official apps use. There are three practical sizes:

| Path | What it can do | Must persist | Protocols | Choose it when | Reference |
| --- | --- | --- | --- | --- | --- |
| **REST only** | Sign in, list and change tasks, projects, notes and the other synced entities while online | Server URL, token (optionally a cache) | HTTP + bearer token | A script, desktop panel, bot or a client that is fine with "no network, no edit" | [`cmd/ot`, `internal/cli`](../internal/cli/client.go) |
| **Push-only sync** | Create tasks and labels, adjust its own writes, queue work offline and deliver it later; it never reads changes back | Device id, token, clock seed, a durable outbox, cached lists | HTTP + the write half of `POST /api/v1/sync` | A capture surface that only sends, such as the Obsidian plugin | [`obsidian/src/outbox.ts`](../obsidian/src/outbox.ts) |
| **Full offline** | Keep a complete replica, edit offline, pull and merge everyone's changes | All of the above plus every row, per-field clocks, cursor, generation, memberships and local documents | The whole sync protocol, the client half of every shared contract | A real task app that works with no connection | [`internal/vault/exchange.go`](../internal/vault/exchange.go) |

The paths are cumulative: a full offline client still uses the REST routes for account work, and a push-only client still needs a valid token. Start with the smallest path that does the job.

## Before you start

- **The server URL is the user's own.** It is an origin such as `https://todo.example.com`; there is no central service to discover. Check it with `GET /api/v1/health` (no sign-in) before asking for credentials.
- **Speak HTTPS.** A plain `http` URL exposes the token on the network, and some features (passkeys) refuse it.
- **The API is versioned by path, not by header.** Every route is under `/api/v1`; within 1.x routes, fields and error codes only grow ([stability and compatibility](stability.md)).
- **A machine-readable description exists.** `GET /api/v1/openapi.json` needs no sign-in, and the same file is committed as [`docs/openapi.json`](openapi.json) and attached to releases. Use it for types and route discovery. It does not describe op payloads in detail, and its generated op schema does not match the sync request in two ways: it types `value` as a string where the wire format carries inline JSON, and it requires `actor` and `seq` on input where the server fills them itself. For `/api/v1/sync`, follow [sync.md](sync.md#exchange) rather than the generated `Op` shape (see [Open questions](#open-questions)).
- **The official apps are references, not dependencies.** `ot` is an online REST client, the Obsidian plugin is push-only and `ot vault` is a full sync loop; each is small enough to read.

## Path 1 — REST only

### 1. Configure the server

Keep the base URL as the user typed it, without a trailing slash. A browser page on another origin can call the API only after the operator lists that origin in `OPENTODO_CORS_ORIGINS`, and only with a bearer token: CORS never allows the session cookie ([calling the API from another site](api.md#calling-the-api-from-another-site)). A native or server-side client has no CORS restriction.

### 2. Get a token

A user can create one in **Settings → Integrations → API tokens**, choose its access, and paste it into your client. That is the simplest and least fragile flow.

A client that only has an email and password can mint a token itself, exactly as `ot login` does ([how a non-browser client signs in](api.md#how-a-non-browser-client-signs-in)):

1. `POST /api/v1/auth/login` with `{"email","password"}` and keep the `opentodo_session` cookie.
2. `POST /api/v1/tokens` with that cookie and `{"name":"my-client@host"}`. Send **no `Origin` header** and `Content-Type: application/json`; a cookie write that names another origin is refused with 403 `bad_origin`.
3. `POST /api/v1/auth/logout`, discard the cookie, keep `secret` and send it as `Authorization: Bearer ot_…`.

If the account has a second factor, step 1 answers `{"mfaRequired":true,"challenge":"…"}` with no cookie; post the challenge and a code to `POST /api/v1/auth/mfa` first ([two-factor authentication](api.md#two-factor-authentication)). A token created in Settings skips the whole session.

Do not reuse the official app's sign-in: `POST /api/v1/app/token` and the `app` scope exist for the OpenTodo app itself ([app sign-in](api.md#app-sign-in)).

### 3. Choose the scope

| Scope | Use it for | Important limit |
| --- | --- | --- |
| `read` | A viewer, dashboard or read-only integration | Every write and `POST /api/v1/sync` is refused with 403 `insufficient_scope`, including creating another token |
| `full` | A normal client that writes | Cannot call the credential routes (tokens, passkeys, second factor, user administration, secret-holding settings) |
| `admin` | An operator script | Adds the credential and administration routes; should not be shipped to end users |
| `agent` | An AI assistant | Writes only through the agent content routes and MCP, and only while both assistant switches are on |
| `app` | The official OpenTodo app | Minted by the official sign-in exchange; acts as `full` |

A token may also be limited to a list of workspaces; every route over the whole account, sync included, then answers 403 `token_restricted` ([token scopes](api.md#token-scopes)). A client that needs to create tasks and projects should ask for `full`.

### 4. Send authenticated requests

Send `Authorization: Bearer <secret>` on every request. Responses are JSON. Do not follow redirects while the token is attached: a token request does not need one, and following one could send the token to another host (the `ot` client disables redirects).

### 5. Read and list

```sh
curl -sS "$OT/api/v1/tasks?project_id=$PROJECT" -H "Authorization: Bearer $TOKEN"
# 200 {"tasks":[ … ]}
```

`GET /api/v1/tasks` returns your tasks and those of projects shared with you. `include_deleted=true` adds tombstones, and `completed_after`/`completed_before` (with `timezone`) list only completions in a range ([one project's items](api.md#one-projects-items), [tasks completed in a range](api.md#tasks-completed-in-a-range)). Every collection has the same list/create/read/patch/delete shape: `projects`, `labels`, `sections`, `fields`, `views`, `reminders`, `notes` and `objectives` ([endpoints](api.md#tasks-projects-and-other-synced-data)).

Two field rules bite clients that assume generic REST:

- `priority` is **1 (highest) to 4 (default)**; a create without it gets 4.
- `position` defaults to the creation time, so a new task is appended. Pass a smaller number than the first task's to put it at the top ([task fields](api.md#task-fields)).

### 6. Create and change

```sh
curl -sS -X POST "$OT/api/v1/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: run42-milk" \
  -d '{"title":"Buy milk"}'
# 201 { "id": "…", "title": "Buy milk", … }
```

`PATCH /api/v1/tasks/{id}` takes a partial body and returns the task; `DELETE` soft-deletes it to the Trash with 204. Deletes are tombstones, not row removals ([task fields](api.md#task-fields)). A PATCH of `description` on a task, project or note can carry `If-Match: "<body_version>"`, the version returned by the last read; when the note changed meanwhile the server answers 409 `body_changed` instead of overwriting ([mergeable documents](sync.md#mergeable-documents)).

### 7. Retry creates safely with `Idempotency-Key`

On a create, `Idempotency-Key` is 1 to 128 characters of letters, digits and `. _ : -`. The server derives the entity id and the op ids from the key and your account, so a retry after a timeout cannot create a second row ([idempotency keys](api.md#idempotency-keys)):

- first request: **201** with the entity;
- same key, same content: **200** with the stored entity and `Idempotent-Replayed: true`;
- same key, different content: **409 `idempotency_conflict`**, nothing written;
- malformed key: **400 `invalid_input`**.

The documentation names tasks, projects, labels, sections, views and reminders. The generic create handler also honours the header for the other collections (`notes`, `objectives`, `fields`, `rules`), and attachment and time-entry creates use it too; the wire contract above is the same ([`internal/httpapi/collections.go`](../internal/httpapi/collections.go), [`idempotency.go`](../internal/httpapi/idempotency.go)). It is **not** a PATCH or DELETE header.

### 8. Parse the error envelope

Every API error is:

```json
{"error":{"code":"invalid_input","message":"task.priority must be an integer from 1 (highest) to 4 (lowest)"}}
```

Some validation errors add `field`. Branch on `code`, not on the human-readable `message`; the codes and statuses are part of the v1 surface ([error codes](api.md#error-codes)). A write with an unknown field or a wrong type is rejected **as a whole**; nothing is partially applied ([behaviour notes](api.md#behaviour-notes)). A path that exists with another method answers 405 `method_not_allowed` plus an `Allow` header, and an unknown path answers 404 `not_found`.

### 9. Handle 401 and 403 differently

- **401 `unauthorized`**: no credential, or a revoked or invalid one. Stop, ask the user to sign in or paste a new token. It is not a signal to retry the same request.
- **403 `insufficient_scope`**: the token is valid but too narrow (a `read` token on a write or on sync, an `agent` token outside its routes, a `full` token on a credential route, a workspace-limited token on an account-wide route).
- **403 `forbidden`**: the account or its role in the project does not allow the action.
- **403 `bad_origin`**: a cookie-authenticated write came from the wrong origin or named neither origin nor a JSON body.
- **403 `reauth_required`**: a session-only route needs a fresh password or code confirmation; a token does not.
- **404 `not_found`** is also what an id you cannot see returns, so do not use it to probe.

### 10. Obey rate limits, and do not assume `Retry-After`

A refused request answers **429 `rate_limited`** (or `account_locked` after repeated failed sign-ins). The documented windows include 10 login attempts a minute per address, 60 quick-add parses a minute per account, 60 new comments a minute and 30 email invitations an hour ([behaviour notes](api.md#behaviour-notes)).

`Retry-After` is sent by some limits and not by others. Verified in the current code: `account_locked`, the live-stream `busy` 503, calendar feeds, routine runs and the assistant's own limits set it; the login and quick-add limits return 429 **without** it ([`internal/httpapi/auth_handlers.go`](../internal/httpapi/auth_handlers.go), [`quickadd.go`](../internal/httpapi/quickadd.go), [`accountlock.go`](../internal/httpapi/accountlock.go)). So:

1. If `Retry-After` is present, wait at least that many seconds (or until that HTTP date).
2. Otherwise back off exponentially with jitter and a cap; do not retry immediately.

This gap is recorded in [Open questions](#open-questions).

### 11. Fail safely on the network

- Set a timeout. `ot` uses 15 seconds; the web app uses 30 seconds. A request with no timeout hangs the outbox.
- Retry `GET` freely with backoff.
- Retry a `POST` **only** with the same `Idempotency-Key` and the same body.
- For `PATCH`, send explicit values and never silently replay a stale read. If you must retry, re-read, re-apply your change and handle `409 body_changed` on note bodies.
- A `DELETE` that times out may already have succeeded; a later 404 is compatible with success.
- Retry 5xx and network errors; do not retry 4xx except 429.

### 12. Never leak the token

Keep it in the OS keychain or an owner-only file, not in logs, crash reports, URLs or analytics. Redact `Authorization` when logging. A token in a query string is not an accepted authentication method, so there is no reason to put one there. Clear it on sign-out.

### 13. Know what the server does for you

A REST-only client can delegate: id generation, op ids, server timestamps, the operation log and last-writer-wins convergence with other devices, field and role validation, recurrence-rule parsing, relative-reminder `fire_at` recalculation after a due change, default reminders (`?default_reminder=true`), trash retention, history and activity, occurrence completion and splitting, export, and quick-add parsing ([quick-add parse](api.md#quick-add-parse)).

It must still do locally: presentation, sorting and filtering, date arithmetic for its own display, any offline queue, and decryption if the account uses end-to-end encryption. On an encrypted account the REST API returns `enc:v1:…` strings for content fields and accepts plaintext writes that the next unlocked device re-encrypts; a client that cannot decrypt should show a placeholder rather than pretend the text is empty ([what is encrypted](e2ee.md#what-is-encrypted-what-is-not)).

The complete surface is in [HTTP API](api.md#endpoints); the working reference is [`internal/cli/client.go`](../internal/cli/client.go) and the commands in [`internal/cli`](../internal/cli).

## Path 2 — Push-only sync

Push-only sync is the write half of the exchange: the client applies its ops on the server and pulls nothing. It is what the Obsidian plugin uses to send a line as a task ([push-only devices](sync.md#push-only-devices), [`obsidian/src/api.ts`](../obsidian/src/api.ts)).

It gives you: offline capture, retries that do not duplicate, and server-side validation, permissions and convergence. The exchange itself gives you no changes made elsewhere and no server value of a refused field. It does not replace REST reads: the Obsidian plugin still lists projects and labels over REST. If you need to show a task after someone else edits it, you need Path 3.

### 1. Make the device id once and keep it

The device id is the `device` on the request and on every op it writes. It is not a credential and the server does not authenticate it; it is how the server tells devices apart.

- Generate a random UUID (v4) and store it in **per-installation, per-device storage**: browser `localStorage`/IndexedDB, an app data directory, or the platform key-value store. The Obsidian plugin stores an install id in Obsidian's local storage, never in `data.json` inside the synced vault ([`obsidian/src/storage.ts`](../obsidian/src/storage.ts)).
- Prefix it if you like. The Obsidian plugin uses `obsidian:<install id>`; the vault uses `vault:<id>`. Do not put personal data in it: the id is shown in history and activity.
- Keep the same value across restarts, upgrades, sign-outs and reconnections. Keep it 1 to 64 bytes (the server validates an op's `device`), and avoid these prefixes, which are reserved for the server's own writers: `server` and `server:*`, `agent:`, `caldav:`, `issues:`, `rule:`, `calsync:`, `public:` and `page:`. `assistant:` is accepted from devices. The authoritative contract is [Device ids](sync.md#device-ids).
- **Never share one device id between two installations.** The pull skips ops authored by the device that asks ([`internal/sync/service.go`](../internal/sync/service.go)), so two devices with one id would not see each other's changes. That does not hurt a push-only client today, but it breaks if you later add pulls or live updates.
- **Changing it** is safe for correctness in a push-only client: the server stores no per-device state it needs. It does change history attribution. A full-sync client that starts a first copy or reseeds from cursor 0 no longer skips the ops it wrote under the old id, so it downloads them again (harmless, they are idempotent), and a newly joined project's catch-up history is replayed because its progress is stored per device. Keep it stable anyway.

### 2. Keep a durable outbox

An outbox entry is one logical user action: the task and its label ops, with a stable id of its own for display and for Undo. Persist the entries **before** you perform the local side effect that would otherwise be lost, for example before editing the source note ([`obsidian/src/send.ts`](../obsidian/src/send.ts), [`outbox.ts`](../obsidian/src/outbox.ts)).

What an entry must hold:

- a stable entry id;
- the complete, immutable ops, each with its own random UUID, `entity`, `entityId`, `field`, `value`, `ts` and `device`;
- enough display metadata to tell the user what was refused (a title, the source note, a project), and the ids to repair or undo it.

Never rewrite an op's id or value in place after it has been queued. A second edit is a new op with a new id. The server deduplicates by `(user_id, op_id)`, so re-sending the exact same op after a timeout is safe; changing the value under an old id makes the change a duplicate that is silently not stored ([`internal/sync/apply.go`](../internal/sync/apply.go)).

### 3. Stamp ops with a hybrid logical clock

Push-only clients still need correct timestamps: the winner rule compares `(ts, device)`, and with the `clock_skew` feature the server refuses an op stamped more than five minutes ahead instead of clamping it ([clocks](sync.md#clocks)).

```text
last  = persisted clock seed (0 on first run)
next  = max(Date.now() + offset, last + 1); last = next
on receive(op)      last = max(last, op.ts)
after exchange      adopt the server's offset if |serverTime - now| > 2 s,
                    else zero; pull a clock more than 5 min ahead back to serverTime
```

Persist `last` with the outbox. `clock_skew` is the feature that makes the server refuse an over-fast clock instead of clamping it, so you can correct and resend. `ot vault` and the Obsidian plugin follow the same rules; the plugin imports the web app's clock and the vault implements its own ([`web/src/lib/hlc.ts`](../web/src/lib/hlc.ts), [`internal/vault/exchange.go`](../internal/vault/exchange.go)).

### 4. Send the right `features`

`features` is an optional array of protocol additions the device handles; unknown entries are ignored by the server, and there is no capability query or version handshake ([exchange](sync.md#exchange)).

| Feature | What it changes | Use it when |
| --- | --- | --- |
| `push_only` | The server applies the ops and returns no pulled page | Any push-only client |
| `clock_skew` | Ops stamped too far ahead are **refused** with reason `clock_skew` and a `serverTime`, instead of being silently clamped | Any client that can correct and resend its clock |
| `backfill_ack` | Each catch-up page carries `backfillSeq`, echoed as `backfillAck`; lost pages are resent | Full sync only |
| `latest_docs` | A first copy leaves out superseded note history | Full sync only |

The Obsidian plugin sends `["push_only", "clock_skew"]` and nothing else. A server older than `push_only` ignores the feature and answers an ordinary page; a push-only client discards it.

### 5. Submit a batch

```http
POST /api/v1/sync
Authorization: Bearer $TOKEN
Content-Type: application/json

{"device":"obsidian:6f1c…","cursor":0,"ops":[ …],"features":["push_only","clock_skew"]}
```

`cursor` is required by the documented request shape and ignored by a push-only exchange; send `0`. Limits are 1,000 ops per request, 64 KB per value and 4 MB per request body ([limits](sync.md#limits)). Split by whole outbox entries, not in the middle of a logical change, so a task never leaves the device without its labels. The Obsidian plugin sends whole entries up to 500 ops per batch ([`obsidian/src/outbox.ts`](../obsidian/src/outbox.ts)).

`tzOffset` is optional and only matters to the server's REST reminder recalculation; a push-only client can omit it.

### 6. Classify what came back

A successful exchange is HTTP 200 even when some ops were refused:

| Answer | Meaning | What to do |
| --- | --- | --- |
| The op is not in `rejected` | Stored or already stored; `applied` and `duplicates` are counts, not a per-op list | Acknowledge the entry |
| `rejected` with `forbidden`, `scope_change`, `not_a_member`, `cycle`, `not_in_scope`, `invalid_reminder`, `invalid_planned_end`, `invalid_day`, `append_taken` | A final verdict on that op; it was not stored | Drop it, keep a record, and tell the user with the reason. The rest of the batch was applied; a refused label does not undo the task |
| `rejected` with `clock_skew` | Not a verdict on the value | Correct the clock, restamp the op (same id, new `ts`), and resend in the same run; the response's `serverTime` is the reference. Ops that shared a timestamp should share the new one |
| `rejected` with `rate_limited` | Temporary | Keep the op and retry after a backoff |
| A reason you do not know | Possibly a newer server | Treat it as final and surface it; retrying forever would spin. This matches how older clients drop refused ops |
| HTTP 400 `invalid_op` | The **whole batch** failed schema validation; nothing was applied | This is a client bug. Fix the op and resend the batch with the same ids |
| HTTP 400 `bad_request` | Malformed JSON or missing `device` | Fix the request |
| HTTP 401 or 403 | Credential or scope is wrong | Stop pushing and surface it; keep the outbox |
| HTTP 413 `too_large` | The request body is over 4 MB | Split the batch. A single value over 64 KB is rejected as 400 `invalid_op` instead |
| HTTP 429 or 503 | Busy or limited | Back off; obey `Retry-After` when present |
| Network error or timeout | No answer | Keep the whole batch and retry with the same op ids |

Push-only responses deliberately carry **no server value** for refused fields: the client keeps no rows, so there is nothing to restore ([push-only devices](sync.md#push-only-devices)).

### 7. Retry without losing or duplicating

The guarantee is exactly "same op id, at most once stored". It is not a content hash and not an `Idempotency-Key`.

```text
loop forever:
  entries = outbox.all()
  if entries is empty: sleep until the next trigger
  batch = take whole entries up to 500 ops
  try  answer = POST /sync {device, cursor: 0, ops: batch.flatMap(entry.ops),
                            features: ["push_only", "clock_skew"]}
  catch network:        keep batch, backoff, continue
  catch 401/403:        keep batch, stop, surface the credential problem
  catch 429/503:        keep batch, wait Retry-After or backoff, continue

  if answer is 400 invalid_op: fix the ops, keep ids, continue
  for entry in batch:
    if any op is rejected for a final reason:
      remove the entry from the outbox; show the user a refusal notice
    else if any op is rejected for clock_skew:
      restamp those ops from serverTime; put the entry back at the front
    else:
      remove the entry (acknowledged)
```

Remove an entry only after the answer is in; a crash before that replays it, and the server counts the ops as duplicates. Keep entries across restarts and connectivity loss. On sign-out, either discard the outbox or bind it to the account id and refuse to replay it with a different account's token; the Obsidian plugin clears it on Disconnect ([`obsidian/src/storage.ts`](../obsidian/src/storage.ts)). If the user undoes a send that is already in flight, send a compensating delete (a tombstone) instead of dropping the entry ([`obsidian/src/send.ts`](../obsidian/src/send.ts)).

### 8. Work offline and respect the server

Sending must never wait for the network. The Obsidian plugin pushes on start, when the network returns, every minute while something waits, and on demand ([`obsidian/src/main.ts`](../obsidian/src/main.ts)). Use the same shape: a trigger on start/online, a timer while the outbox is non-empty, and a manual "send now".

`/api/v1/sync` has no documented per-account rate limit, but that is not permission to spin: a 429 can still arrive from a proxy or a demo instance, and a 503 `busy` comes with `Retry-After`. Use a timer, jittered exponential backoff on failure, and a cap.

### 9. Encrypted accounts

If the account uses end-to-end encryption, encrypt the content fields **before** queueing the ops, not when the network happens to be available, and only for the personal scope. The format and its authenticated data are in [end-to-end encryption](e2ee.md#how-it-works) and the exact key record, nonces and vectors are in [Path 3](#path-3--full-offline-client-outline). The Obsidian plugin's keyring does this and refuses to send while locked ([`obsidian/src/crypt.ts`](../obsidian/src/crypt.ts)).

## Path 3 — Full offline client (outline)

This path is a roadmap, not a drop-in algorithm. Follow the linked specifications; the working loop is [`internal/vault/exchange.go`](../internal/vault/exchange.go) and the browser's [`web/src/lib/sync.ts`](../web/src/lib/sync.ts) with [`ops.ts`](../web/src/lib/ops.ts).

1. **Local model.** Store one row per entity and one clock per field, apply ops into rows, keep tombstones, and derive trees, order, Inbox membership and activity instead of storing them ([operation](sync.md#operation), [op schema](sync.md#schema-v1)).
2. **Clock.** Persist a hybrid logical clock and its offset; stamp every local op with `max(now + offset, last + 1)`, move `last` past every received op, and correct after an exchange ([clocks](sync.md#clocks)). Persist the clock seed or a restart can stamp a new edit before an older queued one.
3. **Winner rule.** An incoming value replaces the stored one when `op.ts > cur.ts || (op.ts == cur.ts && op.device > cur.device)`; every device runs the same comparison ([winner rule](sync.md#winner-rule)).
4. **Pull and apply.** Send the stored cursor with pending ops, apply the returned ops in order, save the new cursor, and repeat while `hasMore` is true. Pages hold at most 1,000 ops and about 4 MB; the caller's own device's ops are skipped but still advance the cursor ([exchange](sync.md#exchange), [paging](sync.md#paging)). A first copy should send `latest_docs` and keep going from cursor 0 until `hasMore` is false ([first copy](sync.md#first-copy)).
5. **Generation and stale checkpoints.** Store `generation` from the first exchange and compare it on every later one. A different value means the server was restored. Then, in one local transaction, re-emit every stored field with its **stored clock** as a new op, add those to the outbox, set `cursor = 0`, keep the existing outbox, and pull from zero. Do not bump timestamps to now: the old clock is what makes the re-seed converge and keeps a stale device from overwriting newer data ([log generation](sync.md#log-generation)). A generation mismatch is the only stale-cursor case the protocol defines.
6. **Sharing scopes and permissions.** Every op belongs to `user:<id>` or `project:<id>`; a task never changes scope. The server checks the author's membership at receipt, not the op timestamp, and refuses with `forbidden`, `scope_change` or `not_a_member` while applying the rest. A full-sync response carries the server's value of each refused field in `ops`, so restore it. `memberships` and `workspaces` arrive on every exchange; membership is outside the log and changes only over REST. A device that joins a project gets its history replayed first, with `backfillSeq`/`backfillAck` when it asks ([sharing scopes](sync.md#sharing-scopes)).
7. **Notes documents.** `notes_doc` is a full-state Yjs document in an opaque envelope (`ydoc:v1:<base64>`), and `description` is its Markdown projection. The server validates only the envelope and never merges. The client must merge every received document (win or lose), republish the union with a newer clock when it gained content, and write `description` in the same batch. Plain-text writes are folded back into the document; pending appends are merged the same way ([mergeable documents](sync.md#mergeable-documents)). The browser implementation is [`web/src/lib/richtext.ts`](../web/src/lib/richtext.ts).
8. **Encrypted accounts.** The server stores a wrapped key record and never decrypts. The account key is AES-256-GCM; the passphrase key is PBKDF2-HMAC-SHA-256 with a 16-byte salt and 600,000 iterations; the recovery key is HKDF-SHA-256. A value is `enc:v1:` plus base64url of a 12-byte nonce, ciphertext and a 16-byte tag, with AAD `entity + "\0" + entityId + "\0" + field`; attachments use the `OTAT1` chunk format. Test vectors are in [`web/src/lib/e2ee.vectors.json`](../web/src/lib/e2ee.vectors.json), pinned in Go and TypeScript ([how it works](e2ee.md#how-it-works), [shared contracts](contracts.md)). Encrypt at the point where ops leave the device, never before local application; decrypt before applying. Shared projects are never encrypted. A content field larger than 48,000 UTF-8 bytes cannot be encrypted within the 64 KB value limit.
9. **Shared contracts to reproduce.** A full client needs the op schema, the clock and winner rule, recurrence and occurrence projection, zoned due dates, manual order, subtask and sub-project tree rules, dependencies, activity derivation, filter parsing and evaluation, relative reminder recomputation, note merging and the encryption format. Most of these are pinned by a shared fixture that a Go and a TypeScript test both read; note merging and manual order live in the client and the protocol. Do not re-derive the rules from prose alone ([shared contracts](contracts.md), [manual order](sync.md#manual-order), [reminders](sync.md#reminders)).
10. **State to persist.** Server URL and token; device id; clock seed and offset; outbox; cursor; generation; backfill acknowledgement; every entity row with its per-field clocks and tombstones; memberships; workspaces; pending purges; note documents and pending appends; decrypted data and, if encrypted, the unwrapped key (or the wrapped record plus the user's passphrase-derived key); per-device UI state such as the start view and collapsed projects, which are deliberately never synced ([saved views](sync.md#saved-views)).

Open questions for this path are listed below; a first implementation should not invent answers.

## Shared contracts and server responsibilities

Some rules exist twice, once in Go and once in TypeScript, and are pinned by a fixture both suites run ([shared contracts](contracts.md)). Which ones you must reproduce depends on the path:

| Contract | REST only | Push only | Full offline |
| --- | --- | --- | --- |
| Token scopes, error envelope, `Retry-After` handling | Reproduce | Reproduce | Reproduce |
| Quick-add grammar | **Delegate** to `POST /api/v1/quick-add/parse` | Optional: delegate or bundle a parser | Same as push |
| Op schema, op ids, clock, winner rule | Delegate | Clock yes, comparison no | Reproduce |
| Field validation, role checks, ids, timestamps | Delegate | Delegate | Delegate on write, but still validate locally for a good UX |
| Recurrence rules and occurrence projection | Delegate validation, do display | Delegate | Reproduce |
| Zoned due values, manual order, trees, dependencies | Delegate storage, reproduce display | Delegate | Reproduce |
| Filter parsing and evaluation, statistics, activity derivation | Reproduce locally | Not needed | Reproduce |
| Note document merge (Yjs) and body versions | Delegate storage; `If-Match` for writes | Not needed | Reproduce |
| Encryption format and test vectors | Only if reading encrypted content | Required for encrypted accounts | Required for encrypted accounts |

A REST-only client does **not** need the full Go/TypeScript shared-contract suite: it can let the server validate, order and converge. It only needs the presentation rules its UI actually uses.

### Quick-add parsing, without duplicating a parser

`POST /api/v1/quick-add/parse` reads one line with the app's grammar and writes nothing, so a `read` token may call it ([quick-add parse](api.md#quick-add-parse)). Body: `{"line","url"?,"today"?,"now"?,"day_parts"?}`. Send `today` and `now` from the device; they win over the server's clock. The line is read in the account's interface language, then `Accept-Language`, then English, with the account's date order, week start and its projects and labels.

```sh
curl -sS -X POST "$OT/api/v1/quick-add/parse" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"line":"Buy milk tomorrow p2 @shop +15","today":"2026-10-09","now":"10:00"}'
```

With that exact line and context the shared vectors expect the title `Buy milk`, `due.date` `2026-10-10`, priority 2, label `shop` and an estimate of 15 minutes ([`quickadd.vectors.json`](../web/src/lib/nlp/quickadd.vectors.json)). The answer is `{title, fields, chips, unmatched, origin}`: `fields` holds only what the line set, in the form `POST /api/v1/tasks` takes; `chips` are preview spans; `unmatched` are `#names` that match no project; `origin` is the recognised origin of an optional `url` ([quick-add parse](api.md#quick-add-parse)).

The answer is not a request body for `POST /api/v1/tasks`. `fields.labels` is `[{id?, name}]` and a label without an id must be created first; `fields.spent_minutes` becomes a time entry; `fields.reminders` becomes `POST /api/v1/reminders` after the task exists. Errors are 400 `invalid_input` (bad body, long line, bad date), 401 and 429 `rate_limited` above 60 parses a minute per account.

## Stability and compatibility

- **Version by path.** 1.x serves `/api/v1`; a breaking change needs `/api/v2` ([what may change within 1.x](stability.md#what-may-change-within-1x)).
- **Ignore unknown fields and unknown values of open enumerations.** The server only adds response fields, routes, error codes, op entities/fields and MCP tools within 1.x. A client that chokes on an unknown field will break on a minor release ([clients must ignore](stability.md#the-v1-surface)).
- **Ignore unknown op entities and continue.** An older client that receives an op for an entity it does not know must ignore it without failing the batch; the cursor still advances ([schema](sync.md#schema-v1)).
- **Feature negotiation is additive and one-way.** Send the features you understand; the server ignores the rest. There is no server list of supported features and no protocol version number. If a feature is not understood by the server, you get the older behavior (for `push_only`, a full page you discard).
- **Deprecation is announced, not silent.** A deprecated route keeps working and sends `Deprecation` and `Sunset`; removal only happens by serving a new major path ([deprecation](stability.md#deprecation)).
- **Upgrades keep devices.** A 1.x server accepts every 1.x client, and devices continue from their cursor without a full download. A server restore changes the log generation; that is the documented resync trigger ([upgrades](stability.md#upgrades)).
- **The OpenAPI description only grows** within 1.x and is generated from the same route analysis. Do not treat its current gaps as permission to invent contracts ([OpenAPI description](api.md#openapi-description)).

## Open questions

These are the places where the code and the prose still leave a client author guessing. They are questions for the maintainer, not license to invent behavior.

1. **`Retry-After` on 429.** Some limits set it and some do not (login and quick-add currently do not). Should third-party clients always back off when it is absent, and should the API reference say which limits set it? The guide currently says "use it when present, back off otherwise".
2. **Generated sync schema.** `docs/openapi.json` types an op's `value` as a string and marks `actor` and `seq` as required on **input**, while the server accepts inline JSON `value` and ignores/stamps `actor` and `seq`. Should the generator special-case `Op`, or should clients keep reading [sync.md](sync.md#operation) for the op envelope?
3. **Sync pressure.** `/api/v1/sync` has no documented per-account rate limit, while the web app polls every 30 s (5 min with live updates) and the Obsidian plugin pushes every 60 s. Is there a recommended floor for a third-party poller?
4. **Feature discovery.** `features` is client-to-server only. Is that permanent, or will a server eventually advertise supported features so a client can avoid sending a feature it cannot use?

## References

- [HTTP API](api.md) — every route, field, status and error code; [checked examples](api.md#checked-examples).
- [Sync protocol](sync.md) — operations, schema, clocks, winner rule, exchange, scopes, documents, purge, compaction.
- [End-to-end encryption](e2ee.md) and the vectors in [`web/src/lib/e2ee.vectors.json`](../web/src/lib/e2ee.vectors.json).
- [Shared contracts](contracts.md) — every Go/TypeScript pair and its fixture.
- [Stability and compatibility](stability.md).
- Working code: [`internal/cli`](../internal/cli) (REST), [`obsidian/src`](../obsidian/src) (push-only), [`internal/vault`](../internal/vault) (full sync).
- OpenAPI: `GET /api/v1/openapi.json`, [`docs/openapi.json`](openapi.json); the generator proposal and implementation are [#1420](https://github.com/OpenTodoApp/OpenTodo/pull/1420) and [#1423](https://github.com/OpenTodoApp/OpenTodo/pull/1423), with the issue at [#1416](https://github.com/OpenTodoApp/OpenTodo/issues/1416).
