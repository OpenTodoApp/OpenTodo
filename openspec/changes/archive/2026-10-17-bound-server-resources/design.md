# Design

## D1 Password hashing slots
A package-level semaphore in `internal/auth/password.go` (capacity `max(2, 2×GOMAXPROCS)`) wraps every argon2id derivation, in `HashPassword` and `VerifyPassword`. A caller waits at most one second for a slot, then gets `auth.ErrBusy`; `Server.internal` maps it to 503 `busy` with `Retry-After: 1`, so every handler that already sends unknown errors to `internal` answers correctly without its own case. Peak memory for hashing is bounded by slots × 19 MiB (about 150 MiB on a four-core Pi). `VerifyPassword` now returns `(bool, error)`.

## D2 Policy before the hash
`admitRegistration` and `admitProjectInvite` hold the checks that used to run inside the write transaction. They run twice: in a read transaction that is rolled back before hashing, and again in the write transaction, so a policy change in between is still caught and the hash is never computed while the single database connection is held. `ResetPassword` checks the link with `PreviewPasswordReset` first; the conditional update still decides. Open sign-up with verification keeps hashing first: answering faster for an existing address would reveal it.

## D3 Timing of passwordless accounts and long passwords
`VerifyPassword` verifies the dummy hash whenever the stored hash does not parse (empty for single sign-on and demo accounts), so such an account costs one derivation like an unknown address. A password over 1,024 bytes is refused without a derivation, for known and unknown addresses alike; it can never match, since none can be set.

## D4 Live-stream caps
`sync.MaxStreamsPerUser` drops from 16 to 10 and keeps closing the oldest. `httpapi.streamCounter` counts streams per client address (`clientIP`, so trusted proxies are honoured) and in all; it is checked after authentication and before the subscription, and the slot is released when the handler returns. Over a cap the answer is 503 `busy` with `Retry-After: 30`; the web client already reconnects with backoff and polls meanwhile.

## D5 Push sends
`Tick` groups due reminders by account and runs `SendWorkers` (8) workers; each account's reminders stay in order. Within an account, sends stop once `UserSendBudget` (20 s, wall clock) is spent; the reminder is then treated like an all-failed one (retried while less than an hour overdue). A reminder that was partly sent is sent again to all of the account's subscriptions on the next pass; the `Topic` header collapses copies still queued at the push service and the service worker replaces a notification with the same reminder id. A subscription is disabled when `failures ≥ 20` and nothing was delivered for 24 h (since `last_ok_at`, or `updated_at` when it never delivered); the time condition keeps a short push-service outage from disabling devices. Registering the same endpoint again clears the failures of a disabled subscription. A new subscription is inserted together with a delete of the account's rows beyond 20 by `updated_at`. No schema change: the `failures` and `updated_at` columns exist.

## D6 Last-use writes
The token and app-password lookups read `last_used_at` and write it only when it is missing or at least a minute old (`auth.LastUseInterval`), so steady traffic costs one write a minute per credential instead of one per request. `requireSessionOrFull` uses `tokenFrom(ctx)` set by `requireAuth`; every route that calls it is behind `requireAuth`, and a request without that context fails closed.

## D7 JSON bodies
`internal/httpapi/jsonbody.go` holds `readJSON` (strict), `readJSONLoose`, `readJSONLimit`, `badBody` and `badBodyWith`. Unknown fields are refused through `DisallowUnknownFields` (no effect on map targets: the REST entity bodies, MCP settings, agent access, webhooks and comments, which validate their keys themselves). Loose on purpose: `POST /api/v1/sync` (op batches from newer clients), `POST /api/v1/push/subscriptions` (`PushSubscription.toJSON()` has `expirationTime`), passkey registration and sign-in (`PublicKeyCredential.toJSON()` grows with the spec). After the value only white space may follow. `http.MaxBytesError` becomes 413 `too_large`. Messages are written by us: `invalid JSON body`, `… unknown field "x"`, `… email must be a string`. The password-reset, assistant settings and agent REST decoders now use the same function with their own limits. Every handler's 400 code and message stay as they were; only the oversize case changes to 413.

Checked clients: `web/src/lib/api.ts` and its callers build every body from the fields each route defines (backup and attachment settings send back the GET shape, which equals the route's struct); the CLI sends `{email,password}`, `{name,scope}` and entity maps; the browser extension calls no API.

## Size and memory
No dependency. Runtime memory: hashing now bounded (above); a few bytes per open stream for the counter.
