# HTTP API

Base path: `/api/v1`. All requests and responses are JSON. Errors look like:

```json
{ "error": { "code": "invalid_input", "message": "task.priority must be an integer from 1 (highest) to 4 (lowest)" } }
```

## Authentication

Two options:

- **Session cookie** (the web app). Obtained from `auth/register` or `auth/login`. State-changing requests must come from the app's own origin.
- **Bearer token** (scripts, CLI, AI assistants). Create one in **Settings → API tokens** or via `POST /tokens`, then send `Authorization: Bearer ot_…`.

A token has a **scope**: `full` (the default) or `read`. A `read` token reads everything its account can read but is refused with 403 `insufficient_scope` on every request that can change something: every method other than `GET`, `HEAD` and `OPTIONS`, and `/api/v1/sync` whatever the method. That includes creating another token, so a read token cannot escalate itself. Tokens created before scopes existed are `full`. Give read tokens to anything that only needs to look, such as an AI assistant connected to the [MCP endpoint](mcp.md).

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

If the account has two-factor authentication, step 1 answers `{"mfaRequired":true,"challenge":"…"}` without a cookie. Post the challenge and a code to `POST /api/v1/auth/mfa` to get the cookie, then continue with step 2 (see [Two-factor authentication](#two-factor-authentication)). The fresh session can create the token without re-authenticating. Bearer tokens are never asked for a code.

### Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/healthz` | none | `{"status":"ok","version":"…"}` |
| GET | `/api/v1/auth/status` | none | `{setupRequired, signupAllowed, authenticated, user, version, passkeysAvailable, oidc, mfa?, encryption?, minClientVersion?}` (`mfa`, `encryption` and `minClientVersion` when signed in, see [End-to-end encryption](#end-to-end-encryption); see [Two-factor authentication](#two-factor-authentication); `oidc` see [Single sign-on](#single-sign-on)) |
| POST | `/api/v1/auth/register` | none | `{email, name?, password, invitation?}` → 201 `{user}` + cookie. First account becomes owner; afterwards an `invitation` secret admits one member while sign-up is closed |
| POST | `/api/v1/auth/login` | none | `{email, password}` → `{user}` + cookie, or `{mfaRequired:true, challenge, expiresAt}` and no cookie when the account has a second factor |
| POST | `/api/v1/auth/mfa` | none | `{challenge, code}` or `{challenge, recoveryCode}`, optional `remember` → `{user}` + cookie (+ `ot_trust` cookie when `remember`) |
| POST | `/api/v1/auth/reauth` | cookie | `{password}` or `{code}` → `{reauthAt, validForMs}`; unlocks sensitive routes for 10 minutes |
| POST | `/api/v1/auth/passkey/options` | none | → `{publicKey}` sign-in options, see [Passkeys](#passkeys) |
| POST | `/api/v1/auth/passkey` | none | `{credential}` → `{user}` + cookie |
| POST | `/api/v1/auth/logout` | cookie | 204, or 200 `{redirect}` (provider sign-out, see [Single sign-on](#single-sign-on)) |
| GET | `/api/v1/auth/oidc/start` | none | browser navigation: 302 to the provider (links instead when signed in) |
| GET | `/api/v1/auth/oidc/callback` | none | provider return: 303 to `/` + cookie, or to `/?error=…` |
| GET | `/api/v1/settings/oidc` | owner | provider configuration, secret masked |
| PUT | `/api/v1/settings/oidc` | owner, fresh | change the provider configuration |
| POST | `/api/v1/settings/oidc/test` | owner | `{issuer?}` → `{ok, issuer, authorizationHost, tokenHost, endSessionSupported}` |
| GET | `/api/v1/me/identities` | yes | `{identities:[…], provider}` |
| DELETE | `/api/v1/me/identities/{id}` | yes | 204, or 409 `last_credential` |
| GET | `/api/v1/me` | yes | `{user, mfa, encryption: {enabled, keyVersion}, minClientVersion}` |
| GET | `/api/v1/encryption/keys` | yes | `{keys}`: the wrapped key record, or 404 `encryption_disabled`; see [End-to-end encryption](#end-to-end-encryption) |
| PUT | `/api/v1/encryption/keys` | yes (fresh when replacing) | create (`version: 1`) or replace (`version` = stored + 1) the key record → 201/200 `{keys}`; 409 `encryption_conflict` |
| DELETE | `/api/v1/encryption/keys` | yes, fresh | 204; turns encryption off for the account (404 `encryption_disabled` without a record) |
| POST | `/api/v1/encryption/purge-history` | yes | → `{purged, notice}`; deletes superseded content operations; 409 `encryption_disabled` |
| GET | `/api/v1/tokens` | yes | `{tokens:[{id,name,scope,createdAt,lastUsedAt}]}` |
| POST | `/api/v1/tokens` | yes, fresh | `{name, scope?}` (`full` default, or `read`) → 201 `{token, secret}` (secret shown once); another scope → 400 `invalid_input` |
| GET | `/api/v1/settings/mcp` | yes | `{enabled, endpoint}`: whether the [MCP endpoint](mcp.md) is on and its URL |
| PUT | `/api/v1/settings/mcp` | owner | `{enabled}` → `{enabled, endpoint}`; recorded as `settings.changed` (`mcp.enabled`) in the audit log |
| POST | `/mcp` | bearer token only | read-only Model Context Protocol endpoint for AI assistants, 404 while disabled; see [docs/mcp.md](mcp.md) |
| DELETE | `/api/v1/tokens/{id}` | yes | 204 |
| POST | `/api/v1/passkeys/register/options` | yes | → `{publicKey}` creation options |
| POST | `/api/v1/passkeys/register` | yes | `{name, credential}` → 201 `{passkey}` |
| GET | `/api/v1/passkeys` | yes | `{passkeys:[{id,name,createdAt,lastUsedAt,suspiciousAt,backedUp}]}` |
| PATCH | `/api/v1/passkeys/{id}` | yes | `{name}` → `{passkey}` |
| DELETE | `/api/v1/passkeys/{id}` | yes | 204 |
| GET | `/api/v1/invitations` | owner, admin | `{invitations:[…]}`, see [Invitations](#invitations) |
| POST | `/api/v1/invitations` | owner, admin, fresh | `{email?, expiresInHours?}` → 201 `{invitation, link}` (link shown once) |
| DELETE | `/api/v1/invitations/{id}` | owner, admin | revoke a pending invitation → 204 |
| GET | `/api/v1/users` | owner, admin | `{users:[…]}`, see [User administration](#user-administration) |
| PUT | `/api/v1/users/{id}/role` | owner, fresh | `{role: "admin"\|"member"}` → `{user}` |
| POST | `/api/v1/users/{id}/deactivate` | owner, admin, fresh | → `{user}`; revokes sessions, tokens, pending invitations and reset links |
| POST | `/api/v1/users/{id}/reactivate` | owner, admin, fresh | → `{user}` |
| DELETE | `/api/v1/users/{id}` | owner, admin, fresh | `{confirmEmail}` → 204; deletes the account and its data |
| POST | `/api/v1/users/{id}/password-reset` | owner, admin, fresh | `{expiresInHours?}` → 201 `{expiresAt, link}` (link shown once) |
| POST | `/api/v1/users/{id}/transfer-ownership` | owner, fresh | `{password}` → `{user}` |
| POST | `/api/v1/me/password` | yes, fresh | `{currentPassword, newPassword}` → 204; signs out your other sessions |
| GET | `/api/v1/password-resets/{token}` | none | preview `{email, expiresAt}` or 404 `reset_invalid` |
| POST | `/api/v1/password-resets/{token}` | none | `{password}` → 204 or 404 `reset_invalid` |
| GET | `/api/v1/invitations/{token}` | none | preview `{inviterName, email, expiresAt}` or 404 `invitation_invalid` |
| GET | `/api/v1/mfa` | yes | `{mfa}`, see [Two-factor authentication](#two-factor-authentication) |
| POST | `/api/v1/mfa/totp/enroll` | yes | → `{secret, uri, expiresAt}` (pending for 10 minutes; the only time the secret is returned) |
| POST | `/api/v1/mfa/totp/confirm` | yes | `{code}` → `{recoveryCodes:[10], mfa}` (codes shown once) |
| DELETE | `/api/v1/mfa/totp` | yes, fresh | turn the second factor off → 204 |
| POST | `/api/v1/mfa/recovery-codes/regenerate` | yes, fresh | → `{recoveryCodes:[10]}`; every earlier code stops working |
| GET | `/api/v1/mfa/trusted-devices` | yes | `{devices:[{id,userAgent,createdAt,expiresAt,lastUsedAt}]}` |
| DELETE | `/api/v1/mfa/trusted-devices` | yes | forget every remembered browser → 204 |
| DELETE | `/api/v1/mfa/trusted-devices/{id}` | yes | forget one → 204 |
| GET | `/api/v1/settings/mfa` | owner | `{required: "none"\|"owner"\|"all"}` |
| PUT | `/api/v1/settings/mfa` | owner, fresh | `{required}` → `{required}` |
| POST | `/api/v1/members/{id}/mfa/reset` | owner, fresh | remove a member's second factor, recovery codes and remembered browsers → 204 |
| GET | `/api/v1/backups` | owner | backup status, see [Backups](#backups) |
| GET | `/api/v1/backups/settings` | owner | `{settings, secrets}` (secret presence flags only) |
| PUT | `/api/v1/backups/settings` | owner | `{settings, secrets?}` → `{settings, secrets}` |
| POST | `/api/v1/backups/run` | owner | start a backup now → 202, or 409 `conflict` while one runs |
| POST | `/api/v1/backups/test` | owner | write and delete a probe object at the saved destination → 200 `{ok:true}` or 502 `destination_error` |
| GET | `/api/v1/audit` | owner | `{events:[…], cursor}` newest first; filters `name`, `actor`, `target`, `outcome`, `from`, `to`, `cursor`, `limit≤200`, see [Audit log](#audit-log) |
| GET | `/api/v1/audit/export` | owner | the filtered log as `application/x-ndjson` download; records `audit.exported` |
| GET | `/api/v1/settings/audit` | owner | `{retentionDays, logIp}` |
| PUT | `/api/v1/settings/audit` | owner | `{retentionDays?: 7–3650, logIp?}` → settings; disabling `logIp` erases stored addresses |
| GET | `/api/v1/me/activity` | yes | `{events:[…]}`: your own access events, last 90 days, at most 100 |
| GET | `/api/v1/webhooks` | yes | `{webhooks:[…], events:[…]}`, see [Webhooks](#webhooks) |
| POST | `/api/v1/webhooks` | yes | `{url, events, projectId?, enabled?}` → 201 `{webhook}` (includes `secret`, shown once) |
| GET | `/api/v1/webhooks/{id}` | yes | `{webhook}` (never the secret) |
| PATCH | `/api/v1/webhooks/{id}` | yes | partial `{url?, events?, projectId?, enabled?}` → `{webhook}` |
| DELETE | `/api/v1/webhooks/{id}` | yes | delete with its delivery log → 204 |
| POST | `/api/v1/webhooks/{id}/test` | yes | send a `ping` now → `{ok, delivery}` |
| GET | `/api/v1/webhooks/{id}/deliveries` | yes | `{deliveries:[…]}`, newest 100 |
| POST | `/api/v1/webhooks/{id}/deliveries/{did}/redeliver` | yes | queue the same body with a new id → 202 `{delivery}` |
| GET | `/api/v1/settings/webhooks` | owner | `{allowPrivate}` |
| PUT | `/api/v1/settings/webhooks` | owner | `{allowPrivate}` → `{allowPrivate}` |
| GET | `/api/v1/projects/{id}/members` | member | `{projectId, role, ownerId, members:[{userId,name,email,role}]}`, see [Sharing](#sharing) |
| POST | `/api/v1/projects/{id}/members` | owner, admin | `{email, role}` → 201 membership (shares the project on first use) |
| PATCH | `/api/v1/projects/{id}/members/{userId}` | owner, admin | `{role}` → membership |
| DELETE | `/api/v1/projects/{id}/members/{userId}` | member | remove a member, or leave with your own id or `me` → 204 |
| POST | `/api/v1/projects/{id}/transfer` | owner | `{userId}` → membership; the previous owner becomes an admin |
| GET | `/api/v1/tasks` | yes | `{tasks:[…]}` (yours and those of projects shared with you); `?include_deleted=true` to include tombstones |
| POST | `/api/v1/tasks` | yes | create → 201 task |
| GET | `/api/v1/tasks/{id}` | yes | task or 404 |
| PATCH | `/api/v1/tasks/{id}` | yes | partial update → task |
| DELETE | `/api/v1/tasks/{id}` | yes | soft delete → 204 |
| GET/POST/GET/PATCH/DELETE | `/api/v1/projects…` | yes | same shape for projects |
| GET/POST/GET/PATCH/DELETE | `/api/v1/labels…` | yes | same shape for labels |
| GET/POST/GET/PATCH/DELETE | `/api/v1/views…` | yes | same shape for saved views, see [View fields](#view-fields) |
| GET/POST/GET/PATCH/DELETE | `/api/v1/reminders…` | yes | same shape for reminders, see [Reminders and push](#reminders-and-push) |
| GET/POST/GET/PATCH/DELETE | `/api/v1/sections…` | yes | same shape for sections of projects, see [Sections](#sections) |
| GET | `/api/v1/push/vapid-key` | yes | `{publicKey}`; with `?device={id}` also `subscription` (that device's status or `null`) |
| POST | `/api/v1/push/subscriptions` | yes | `{deviceId, endpoint, keys:{p256dh, auth}, includeContent?}` → 201 `{subscription}` (200 when the device's subscription was replaced) |
| DELETE | `/api/v1/push/subscriptions/{id}` | yes | 204, or 404 `not_found` |
| POST | `/api/v1/sync` | yes | device sync, see `docs/sync.md`; the response carries the log `generation` |
| GET | `/api/v1/sync/events?device={id}` | yes | server-sent event stream; wakes the device when other devices or the API record operations, see `docs/sync.md` |
| GET | `/api/v1/tasks/{id}/history`, `/api/v1/projects/{id}/history` | yes | change sets from the operation log, oldest first; `?before=<ts>&limit=<1-200>` pages backwards; see [Trash and history](#trash-and-history) |
| DELETE | `/api/v1/tasks/{id}/purge`, `/api/v1/projects/{id}/purge` | yes | permanently delete an item that is in the Trash → `{purged:{tasks,projects,reminders,sections,comments}}`; 409 `not_deleted` otherwise |
| POST | `/api/v1/trash/purge` | yes | empty the Trash (every deleted task and project you may delete) → `{purged:{tasks,projects,reminders,sections,comments}}` |
| GET | `/api/v1/tasks/{id}/comments` | yes | `{comments}`: the task's live comments in thread order; 404 for a task you cannot read; see [Comments and activity](#comments-and-activity) |
| POST | `/api/v1/tasks/{id}/comments` | yes | `{body, parent_id?, mentions?}` → 201 comment; 404 for a task you cannot read; 429 `rate_limited` past 60 new comments a minute |
| PATCH | `/api/v1/comments/{id}` | yes | `{body?, mentions?}` → 200 comment with `edited_at` set; 403 `forbidden` unless you wrote it |
| DELETE | `/api/v1/comments/{id}` | yes | 204; allowed for the author, project admins and the owner, 403 `forbidden` otherwise |
| GET | `/api/v1/tasks/{id}/activity`, `/api/v1/projects/{id}/activity` | yes | `{events, more, cursor?}` newest first, derived from the operation log; `?before=<cursor>&limit=<1-200>` (default 50) |
| GET | `/api/v1/activity` | yes | `{events, more, cursor?}`: the activity feed across every shared project you are a member of, newest first; `?cursor=&limit=&project=&actor=&kind=`; see [Activity feed](#activity-feed) |
| GET | `/api/v1/export` | yes | full JSON export (`projects`, `tasks`, `labels`, `views`, `reminders`, `sections`, `comments`), including deleted items and the projects shared with you (with `role` and `owner_id`); never contains audit events or push subscriptions; reminders are personal, so only your own |
| POST | `/api/v1/import/preview` | yes | multipart `file` + options → dry run `{format, totals, rows, …}`, see [Import](#import) |
| POST | `/api/v1/import` | yes | multipart `file` + options → 202 `{job}`; the import runs in the background |
| GET | `/api/v1/import/jobs` | yes | `{jobs:[…]}`, newest first (last 50) |
| GET | `/api/v1/import/jobs/{id}` | yes | `{job}` with status, counts and row errors |
| POST | `/api/v1/import/jobs/{id}/undo` | yes | tombstone everything the job created → `{job}` (status `undone`); idempotent |

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
| `rate_limited` | 429 | more than 10 requests per minute per address to `auth/login`, `auth/register`, `auth/passkey` and the invitation preview combined (one shared window), or more than 10 per minute to `auth/passkey/options` (its own window, so the sign-in screen's autofill request never uses up password attempts) |

The anonymous `auth/passkey` routes apply the same `Origin` check as `auth/login`. A successful passkey sign-in sets the same `opentodo_session` cookie as a password sign-in. Bearer tokens can list, rename and delete passkeys, but a CLI cannot run a ceremony.

### Two-factor authentication

Accounts can add a time-based one-time password (TOTP, RFC 6238: HMAC-SHA1, 6 digits, 30-second steps) from any authenticator app. The server generates and checks the codes with its own clock and contacts nothing, so keep the host's clock synchronised (NTP). A code is accepted one step (30 s) either side of the server's time. Each code completes at most one authentication.

**Profile.** `GET /api/v1/me`, `GET /api/v1/mfa` and `auth/status` (when signed in) carry:

```json
{ "mfa": { "enrolled": true, "recoveryCodesRemaining": 9, "policy": "owner", "required": true, "restricted": false } }
```

`required` means the owner's policy covers this account. `restricted` means the session may only enrol, because the account is required to have a second factor and has none yet. Bearer-token requests are never restricted.

**Enrolment.** `POST /mfa/totp/enroll` returns a fresh `secret` (base32) and its provisioning `uri` (`otpauth://totp/OpenTodo:<email>?secret=…&issuer=OpenTodo&algorithm=SHA1&digits=6&period=30`). The web app renders the QR code locally. Confirm within ten minutes with `POST /mfa/totp/confirm {"code":"123456"}`. The answer contains ten recovery codes such as `ABCDE-FGH23`, shown only this once and stored as SHA-256 hashes. A recovery code can stand in for an app code at sign-in (dash and case optional) and is used up by that sign-in.

**Two-step sign-in.** For an enrolled account, a correct password answers 200 with no cookie:

```bash
curl -sS -c jar -X POST "$OT/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"…"}'
# {"challenge":"Zk3…","expiresAt":1760000300000,"mfaRequired":true}
curl -sS -c jar -X POST "$OT/api/v1/auth/mfa" -H 'Content-Type: application/json' \
  -d '{"challenge":"Zk3…","code":"492039","remember":true}'
# {"user":{…}} + opentodo_session cookie (+ ot_trust cookie)
```

A challenge lasts five minutes and allows five wrong codes. Each wrong code gets `401 mfa_code_invalid`; after the fifth, the challenge is gone and the next attempt gets `401 mfa_challenge_invalid`, which means "enter the password again". `remember: true` sets `ot_trust`, an `HttpOnly`, `SameSite=Lax` cookie (`Secure` on https) limited to `/api/v1/auth` and valid for a fixed 30 days. While that cookie is present, the password step starts the session directly for that account on that browser. A passkey sign-in whose authenticator reports user verification (biometric or PIN) counts as two factors and is never asked for a code. A passkey without user verification answers with the same challenge as a password.

**Step-up.** For cookie sessions, the routes marked *fresh* in the table require a proof of identity within the last ten minutes. A sign-in counts, and so does `POST /auth/reauth` with `{"password":"…"}` or `{"code":"123456"}`. Otherwise they answer `403 reauth_required` and change nothing. The web app then shows a re-authentication dialog and repeats the request once. Bearer-token requests are never challenged.

**Owner policy.** `PUT /settings/mfa {"required":"none"|"owner"|"all"}`. When the policy covers an account that has no second factor, sign-in still works. Every route except `GET /me`, `/mfa/*`, `/auth/reauth` and `/auth/logout` then answers `403 mfa_enrolment_required` until the account enrols. That includes `/sync`, so a device keeps its changes queued and uploads them after enrolment. An account the policy covers cannot turn its second factor off (`403 mfa_required_by_policy`).

**Recovery.** The owner resets a member's second factor with `POST /members/{id}/mfa/reset`. If the owner loses both their authenticator and their recovery codes, stop the server and run `opentodo mfa-reset [--data-dir DIR] <email>` on the host (see [SECURITY.md](../SECURITY.md)). Both are recorded as `mfa.reset`.

| Code | Status | When |
| --- | --- | --- |
| `mfa_code_invalid` | 400 | confirming enrolment with a wrong code or after the ten-minute window |
| `mfa_code_invalid` | 401 | wrong, reused or replayed code or recovery code at `auth/mfa` or `auth/reauth` |
| `mfa_challenge_invalid` | 401 | unknown, expired or exhausted sign-in challenge |
| `mfa_already_enrolled` | 409 | enrol or confirm when a second factor is already active |
| `mfa_not_enrolled` | 409 | disable or regenerate without a second factor |
| `mfa_required_by_policy` | 403 | disabling while the owner's policy covers the account |
| `mfa_enrolment_required` | 403 | any other route while the session is restricted |
| `reauth_required` | 403 | a *fresh* route on a cookie session older than ten minutes since its last proof |
| `invalid_credentials` | 401 | wrong password at `auth/reauth` |
| `invalid_input` | 400 | missing challenge or code, empty re-authentication body, unknown policy value, `auth/reauth` with a bearer token |
| `forbidden` | 403 | `settings/mfa` or a member reset by a non-owner |
| `not_found` | 404 | unknown member id or trusted device |
| `rate_limited` | 429 | more than 10 requests per minute per address to `auth/mfa`, or to `auth/reauth` (separate windows) |

Wrong codes are recorded as `mfa.challenge_failed` with a reason (`wrong_code`, `wrong_recovery_code`) and never the code. Enrolment, disabling and resets are recorded as `mfa.enrolled`, `mfa.disabled` and `mfa.reset`, and policy changes as `settings.changed` (`setting: mfa.required`). A completed sign-in is `login.succeeded` with method `password+totp`, `password+recovery_code`, `password+trusted_device` or `passkey+totp`.

### Single sign-on

The owner can connect one OpenID Connect provider (Authentik, Keycloak, Authelia, Zitadel, a hosted login service). It is off until configured; setup steps are in [self-hosting/sso.md](self-hosting/sso.md). When, and only when, a provider is configured, the server contacts that issuer's discovery document and the token and key endpoints it names (10-second timeout, no redirects followed).

**Status.** `auth/status` always carries `{"oidc":{"enabled":true,"displayName":"Home SSO","ssoOnly":false}}` (`enabled:false` when no provider is configured).

**Sign-in** is a browser navigation, not an API call: `GET /api/v1/auth/oidc/start` redirects to the provider with the authorization-code flow, PKCE (S256), a single-use `state` and a `nonce`, and sets a 10-minute `HttpOnly`, `SameSite=Lax` cookie `ot_oidc` (path `/api/v1/auth/oidc`) holding the signed flow state. The provider returns to `GET /api/v1/auth/oidc/callback`, which exchanges the code, verifies the identity token (RS256, PS256, ES256 or EdDSA signature from the provider's JWKS; issuer, audience, expiry, issued-at and nonce, with 60 seconds of clock leeway) and answers `303` to `/` with the usual `opentodo_session` cookie. The session counts as having passed the second factor: the provider applies its own policy, so an account with TOTP is not asked for a code. The owner's two-factor enrolment policy still applies to the session like any other.

The identity is matched by issuer and subject first; a first-time identity whose **verified** email equals an account's email is linked to that account; otherwise a `member` account is created only if open sign-up is on or the owner enabled `allowProvision`. Failures redirect to the sign-in screen with `?error=`:

| `error` | When |
| --- | --- |
| `oidc_failed` | the provider refused, the code exchange failed or the identity token failed a check (details only in the server log) |
| `oidc_email_unverified` | a first-time identity without an email marked verified |
| `signup_closed` | no matching account and provisioning is not allowed |

`start` while signed in **links** the provider identity to the current account instead (Settings → Linked accounts) and returns to `/settings?linked=1`. If that identity is already linked to the same account, the flow is a fresh proof of identity for the session (the *fresh* routes work for ten minutes) and returns to `/settings?reauthenticated=1`.

The callback answers `400 oidc_state_invalid` (missing, forged, expired or already used state) and `409 identity_taken` (linking an identity that belongs to another account) as JSON; a browser navigation (`Accept: text/html`) is redirected to `/?error=<code>` or `/settings?error=<code>` instead, so people never see raw JSON.

**Owner settings.** `GET /api/v1/settings/oidc`:

```json
{
  "enabled": true, "issuer": "https://sso.example.com/application/o/opentodo", "clientId": "opentodo",
  "clientSecret": "••••a1b2", "clientSecretSet": true, "displayName": "Home SSO", "scopes": "openid email profile",
  "allowProvision": false, "ssoOnly": false, "providerLogout": false,
  "redirectUri": "https://todo.example.com/api/v1/auth/oidc/callback", "baseUrlConfigured": true,
  "managedBy": { "issuer": "settings", "clientId": "settings", "clientSecret": "env", "displayName": "settings",
                 "scopes": "settings", "allowProvision": "settings", "ssoOnly": "settings", "providerLogout": "settings" }
}
```

`PUT` takes any subset of `issuer`, `clientId`, `clientSecret`, `displayName`, `scopes`, `allowProvision`, `ssoOnly`, `providerLogout` and returns the same shape. A new issuer must be an https URL whose discovery document is reachable and names the same issuer, or the answer is `400 invalid_input` and the previous configuration stays. `clientSecret` is write-only: omit it (or send the masked value back) to keep it, send `""` to remove it. A field set by an `OPENTODO_OIDC_*` variable is reported as `managedBy: "env"` and cannot be changed (`400 invalid_input`). An empty `issuer` turns single sign-on off (links are kept). `PUT` needs a fresh session. `POST /api/v1/settings/oidc/test` with optional `{"issuer":"…"}` runs discovery and answers `{ok, issuer, authorizationHost, tokenHost, endSessionSupported}` or `400 invalid_input`. Changes are recorded as `settings.changed` (the secret as `(changed)`).

**SSO-only mode** (`ssoOnly: true`, effective only while a provider is configured): password and passkey sign-in, and registration through the password form, answer `403 sso_required` for every account except the owner (recorded as `login.failed` with reason `sso_required`). The owner keeps local sign-in as break-glass (the sign-in screen shows the password form at `/?owner=1`). Bearer tokens keep working.

**Linked identities.** `GET /api/v1/me/identities` → `{identities:[{id, issuer, email, createdAt, lastLoginAt}], provider:{enabled, displayName, ssoOnly}}`. `DELETE /api/v1/me/identities/{id}` → 204, or `409 last_credential` when the account would have no way left to sign in under the current mode (another identity counts while a provider is configured; a password or passkey counts unless SSO-only mode refuses it for this account). Linking and unlinking are recorded as `identity.linked` / `identity.unlinked`; a provider sign-in as `login.succeeded` with method `oidc`.

**Sign-out.** `POST /auth/logout` always deletes the local session. When `providerLogout` is on and the session started through the provider, it answers `200 {"redirect":"https://sso…/end-session?client_id=…&id_token_hint=…&post_logout_redirect_uri=https://todo.example.com/"}` instead of 204, and the web app follows it after clearing local data.

| Code | Status | When |
| --- | --- | --- |
| `oidc_disabled` | 404 | `auth/oidc/start` or `callback` while no provider is configured |
| `oidc_state_invalid` | 400 | callback with a missing, forged, expired or reused state |
| `identity_taken` | 409 | linking an identity that is linked to another account |
| `last_credential` | 409 | unlinking the account's last way to sign in |
| `sso_required` | 403 | password or passkey sign-in, or password registration, by a non-owner in SSO-only mode |
| `invalid_input` | 400 | issuer not https, discovery failed or names another issuer, client id missing, scopes without `openid`, changing an environment-managed field |
| `forbidden` | 403 | `settings/oidc` by a non-owner |
| `rate_limited` | 429 | more than 20 requests per minute per address to `auth/oidc/start` and `callback` together |

### Task fields

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | |
| `description` | string | the note as **Markdown** text (headings, `**bold**`, `_italic_`, `~~strike~~`, `` `code` ``, links, `-`/`1.` lists, `- [ ]`/`- [x]` check items). Readable and writable as plain text: a write here is folded into the rich-text document by the next app that opens the note. At most 64 KB |
| `notes_doc` | string | the note as a mergeable rich-text document: `""` or `"ydoc:v1:<base64>"` (at most 256 KB). Opaque; scripts normally ignore it and use `description`. `400 invalid_input` when it is not a valid envelope. See [sync.md](sync.md#mergeable-documents) |
| `project_id` | string or null | null = Inbox |
| `parent_id` | string or null | parent task for subtasks, any depth; see [Subtasks](#subtasks) |
| `priority` | 1–4 | 1 highest, 4 default |
| `due` | `{date:"YYYY-MM-DD", time?:"HH:MM", tz?:"Area/City"}` or null | floating date by default; with `tz` (an IANA zone, only together with `time`) a zoned time, the instant at that wall time in that zone. `400 invalid_input` for `tz` without `time` or an unknown zone. See [sync.md](sync.md#zoned-due-values) |
| `labels` | string[] | ids of existing, non-deleted labels; replaced as a whole on PATCH |
| `estimate_minutes` | integer 1–10080 or null | duration estimate in minutes; `0`, negatives, fractions and strings are rejected. The Day and Week calendar draws a task with a due time as a block of this length |
| `recurrence` | string or null | recurrence rule, e.g. `every 3 days after completion` (see [recurrence.md](recurrence.md)); stored in canonical form, `400 invalid_input` when it does not parse or is over 200 characters |
| `series_id` | string or null | on a completed occurrence record or a detached copy: the id of its recurring series |
| `assignee_id` | string or null | account id of the assignee; see [Assignment and notifications](#assignment-and-notifications). `400 not_a_member` when it is not a member of the task's shared project (or not you, for a personal task) |
| `section_id` | string or null | section of the task's project; see [Sections](#sections). `400 invalid_input` for an unknown or deleted section or one of another project. Changing `project_id` without naming a section clears it |
| `ical_extra` | string or null | opaque iCalendar lines a CalDAV client sent that the app does not model (alarms, `X-` properties…); kept so calendar apps do not lose them. See [caldav.md](caldav.md#what-maps-to-what) |
| `position` | number | sort order inside a list: ascending, ties by id; clients move a task by writing the midpoint between its new neighbours (see [docs/sync.md](sync.md#manual-order)) |
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

### Recurring tasks

`POST` and `PATCH` store `recurrence` in canonical form (`"Every  2nd  Tuesday"` is stored as `"every 2nd tuesday"`). A `PATCH` that sets a non-null `completed_at` on an open recurring task behaves like completing it in the app:

- a completed *occurrence record* is created (id derived from the series id and the occurrence date, `series_id` set, `recurrence: null`, other fields copied from the task after the rest of the PATCH is applied),
- the task stays open and its `due` moves to the next occurrence (time and `tz` kept); the response is the task with the new `due`,
- when the end condition (`until` or `for N times`) is reached, the task is completed normally instead.

"Today" for catch-up and completion-relative rules is the server's local date (the container's time zone, UTC by default). Reopening a record (`completed_at: null`) turns it into a standalone task; the series is not moved back. Skip and "this occurrence only" are client actions: a script skips by PATCHing `due`.

```bash
# Make a task repeat, then complete the current occurrence
curl -sS -X PATCH "$OT/api/v1/tasks/<id>" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"recurrence":"every weekday","due":{"date":"2026-10-12"}}'
curl -sS -X PATCH "$OT/api/v1/tasks/<id>" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"completed_at":1760264400000}'
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

### Sections

A section is a named, ordered container inside one project (OpenSpec change `board-view`): a heading in the list view and a column on the board. Sections are soft-deleted like everything else, live in the sharing scope of their project (editors and up may write them, viewers read them) and appear in the export, deleted ones included.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | required, not blank |
| `project_id` | string | required on create: an existing, non-deleted project; cannot change afterwards (`400 invalid_input`) |
| `position` | number | ascending order within the project; defaults to now (last) |
| `created_at` | number | set by the server when omitted |
| `deleted_at` | number or null | set by `DELETE` |

`DELETE /api/v1/sections/{id}` tombstones the section and, in the same batch, sets `section_id` to `null` on each of its open tasks, so they move to "No section". Unknown fields are refused with `400 invalid_input`; requests without credentials get `401 unauthorized`.

```sh
# Create a section, put a task in it, then move the task back to "No section"
curl -X POST -H "Authorization: Bearer $T" -d '{"name":"Doing","project_id":"<project>"}' $BASE/api/v1/sections
# 201 {"id":"…","name":"Doing","project_id":"<project>","position":1760000000000,"created_at":1760000000000}
curl -X PATCH -H "Authorization: Bearer $T" -d '{"section_id":"<section>"}' $BASE/api/v1/tasks/$TASK
curl -X PATCH -H "Authorization: Bearer $T" -d '{"section_id":null}' $BASE/api/v1/tasks/$TASK
curl -X POST -H "Authorization: Bearer $T" -d '{"name":"Doing","project_id":"missing"}' $BASE/api/v1/sections
# 400 {"error":{"code":"invalid_input","message":"section.project_id references unknown or deleted project \"missing\""}}
```

### Label fields

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | required on create, must not be blank; uniqueness is advisory (the app refuses duplicates per device, the API accepts them so merges stay possible) |
| `color` | string | CSS colour; picked from the palette when omitted on create |
| `position` | number | sidebar order; defaults to the creation time |
| `created_at`, `deleted_at` | unix ms (or null) | |

Tasks reference labels by id, so renaming a label is one PATCH and never rewrites tasks. Deleting a label through the API only sets its tombstone; tasks that still carry the id keep it (the app hides ids of deleted labels), and the app's own delete additionally removes the id from every carrying task.

### View fields

A saved view is a named filter query with presentation options (OpenSpec `custom-views`). The app pins views to the sidebar and composes dashboards from them; queries are evaluated on each device, the server only checks that they parse.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | required on create, must not be blank |
| `query` | string | required on create for list views; must parse under the grammar in [`docs/filters.md`](filters.md), otherwise 400 with the parser's message (`view.query: Unknown term "urgent" at position 6`); may be empty for dashboards |
| `kind` | `"list"` or `"dashboard"` | default `list`; cannot be changed after creation |
| `group_by` | `"project"`, `"due"`, `"priority"`, `"label"` or `"none"` | default `project` |
| `sort_by` | `"due"`, `"priority"`, `"position"`, `"created"` or `"title"` | default `due` (undated tasks last) |
| `sort_dir` | `"asc"` or `"desc"` | default `asc`; for `priority`, `desc` lists priority 1 first |
| `pinned` | boolean | shown in the sidebar's Views group; default `false` |
| `position` | number | sidebar order; defaults to the creation time |
| `color` | string | CSS colour; default `#64748b` |
| `panels` | string[] | dashboards only: up to 6 ids of existing, non-deleted **list** views, no duplicates, never the dashboard itself; replaced as a whole on PATCH |
| `created_at`, `deleted_at` | unix ms (or null) | |

Values outside the listed sets are rejected with 400 `invalid_input` on `POST` and `PATCH` and nothing is written. The sync endpoint, by contrast, accepts any string for `kind`, `group_by`, `sort_by` and `sort_dir` so that a future option stays additive; clients show the default for a value they do not know (see `docs/sync.md`, "Saved views"). Deleting a view sets its tombstone only; dashboards that list it keep the id and the app shows a "View removed" placeholder in that panel. The start view each device opens on launch is a device setting and is not part of the API.

### Reminders and push

A reminder belongs to one task and fires at an instant (OpenSpec change `reminders`; data model in [`docs/sync.md`](sync.md#reminders), behaviour in [`docs/reminders.md`](reminders.md)).

| Field | Type | Notes |
| --- | --- | --- |
| `task_id` | string | required on create; must name an existing, non-deleted task |
| `kind` | `"relative"` or `"absolute"` | default `absolute` |
| `offset_minutes` | integer or null | relative only: minutes from the task's due time, negative = before (−525600…525600) |
| `fire_at` | unix ms or null | absolute: required. Relative: computed by the server from the task's due date when omitted (09:00 for a date-only due, in the zone offset the user's devices last reported, UTC until then; a zoned due in its own zone); null while the task has no due date |
| `delivered_at` | unix ms or null | written by the server when it pushed the reminder |
| `dismissed_at`, `created_at`, `deleted_at` | unix ms (or null) | |

`PATCH /api/v1/tasks/{id}` that changes `due` (including completing a recurring task, which moves the series) recomputes `fire_at` of the task's relative reminders in the same batch, with the same timestamp as the due op.

**Push subscriptions** are per device and outside the op log and the export. `POST /api/v1/push/subscriptions` takes the browser's `PushSubscription.toJSON()` plus the device id:

```json
{"deviceId": "8c1f…", "endpoint": "https://fcm.googleapis.com/fcm/send/…",
 "keys": {"p256dh": "BCVx…", "auth": "BTBZ…"}, "includeContent": false}
```

It answers 201 `{"subscription": {"id", "deviceId", "includeContent", "createdAt", "lastOkAt", "lastError", "failures", "needsRenewal"}}`; the endpoint and keys are never returned. Posting again for the same device replaces its subscription (200). A body without an `https` endpoint URL, an uncompressed P-256 `p256dh` key or a 16-byte `auth` secret is rejected with 400 `invalid_input`. A subscription created with a browser session is deleted when that session signs out or is revoked; the push service answering 404/410 deletes it as well, and `needsRenewal` turns true after 5 consecutive failed sends. With `OPENTODO_PUSH=off` every `/api/v1/push/` route answers 404 `not_found`.

`POST /api/v1/sync` accepts an optional `tzOffset` (minutes east of UTC, −840…840): the device's zone, used for the REST recomputation above.

### Invitations

Invitations let the owner admit one person with one single-use, expiring link while sign-up stays closed. Accounts with the `owner` or `admin` role may create, list or revoke them; a member gets 403 `forbidden`. Invitations always admit a `member`. Invitations are server-side account data: they are never written to the op log and never sync to devices.

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

### User administration

The owner, and admins within narrower limits, administer the accounts on the server. User administration is server-side account data: never written to the op log, never synced, and every action needs a connection. Roles:

| Action | owner | admin | member |
| --- | --- | --- | --- |
| invite, list and revoke invitations; list users | yes | yes | no |
| deactivate, reactivate, reset or delete a `member` | yes | yes | no |
| the same on an `admin` | yes | no | no |
| anything on the owner | no | no | no |
| change role (`admin` ↔ `member`), transfer ownership | yes | no | no |
| change own password | yes | yes | yes |

Checks run in this order: acting on your own account gives 409 `self_action`; a role that does not allow the action gives 403 `forbidden` (a member gets 403 on every mutating `/users` route); a target in the wrong state gives 409 `account_deactivated` or `account_active`; an unknown id gives 404 `not_found`. Every mutating `/users` route and `/me/password` is *fresh*: a cookie session must have proved its identity in the last ten minutes (`403 reauth_required`, see [Two-factor authentication](#two-factor-authentication)); bearer tokens are never challenged.

**List** — `GET /api/v1/users` → oldest first, never a credential:

```json
{"users": [
  {"id": "…", "email": "owner@example.com", "name": "Owner", "role": "owner",
   "createdAt": 1760000000000, "lastLoginAt": 1760090000000, "status": "active"},
  {"id": "…", "email": "m@example.com", "name": "m", "role": "member",
   "createdAt": 1760001000000, "lastLoginAt": null, "status": "deactivated"}
]}
```

`lastLoginAt` is the last session start (password, passkey, second step or registration); it is `null` for accounts that have not signed in since the upgrade. `status` is `active` or `deactivated`.

**Role** — `PUT /api/v1/users/{id}/role` with `{"role":"admin"}` or `{"role":"member"}` → `{user}`. `owner` or an unknown value is 400 `invalid_input`; a deactivated target is 409 `account_deactivated`. The new role applies to the target's next request without signing them out.

**Deactivate / reactivate** — `POST /api/v1/users/{id}/deactivate` → `{user}`. In one transaction the account is marked deactivated, all its sessions and API tokens are deleted, and its pending invitations and unused reset links are revoked; its open `/sync/events` streams are closed at once. Its data stays on the server. A correct password for it then gets 403 `account_deactivated` at sign-in (a wrong one still gets 401 `invalid_credentials`). `POST …/reactivate` lifts the block; revoked credentials are not restored. Deactivating a deactivated account is 409 `account_deactivated`; reactivating an active one is 409 `account_active`.

**Delete** — `DELETE /api/v1/users/{id}` with `{"confirmEmail":"m@example.com"}` (compared case-insensitively; missing or different is 400 `confirmation_mismatch`) → 204. In one transaction the account, its personal ops and fields, sessions, tokens, passkeys, reset links and the invitations it created are deleted. Shared projects it owned are deleted for every member (their devices purge them on the next sync); its memberships in other people's projects end, while the edits it made there stay part of those projects. Audit events about the account are kept with an email snapshot. Irreversible: backups are the recovery path.

**Reset links** — `POST /api/v1/users/{id}/password-reset` with optional `{"expiresInHours": 1–72}` (default 24) → 201:

```json
{"expiresAt": 1760086400000, "link": "https://todo.example.com/reset/otr_…"}
```

The link is returned once (only its hash is stored) and uses the same origin rules as invitation links. Nothing is emailed; the administrator copies it. A new link revokes earlier unused ones. A deactivated target is 409 `account_deactivated`; a bad expiry 400 `invalid_input`. The owner is never a target: on the server, `opentodo reset-owner-password` prints an owner reset link (see [docs/self-hosting/docker.md](self-hosting/docker.md#recovering-owner-access)).

`GET /api/v1/password-resets/{token}` (no authentication) → `{email, expiresAt}`. `POST /api/v1/password-resets/{token}` with `{"password":"…"}` → 204: the password is replaced, the link is spent and every session of the account is deleted in one transaction; API tokens are kept and no session is started. Used, expired, revoked and unknown tokens all give the same 404 `reset_invalid`; a password under 10 characters is 400 `invalid_input` and the link stays pending. Both routes share the per-address sign-in limit (10 per minute).

**Own password** — `POST /api/v1/me/password` with `{"currentPassword":"…","newPassword":"…"}` → 204. Your other sessions are signed out, the current one stays (a bearer-token request signs out every session), API tokens are kept. A wrong current password is 403 `invalid_credentials`; a short new one 400 `invalid_input`. Limited to 10 per hour per account.

**Transfer** — `POST /api/v1/users/{id}/transfer-ownership` with `{"password":"…"}` (the owner's) → `{user}` with `role: "owner"`. In one transaction the target becomes owner and the previous owner becomes admin; the database allows only one owner. A deactivated target is 409 `account_deactivated`, your own id 409 `self_action`, a wrong password 403 `invalid_credentials`, a sender who is not (or no longer) owner 403 `forbidden`.

Mutating `/users` requests are limited to 60 per hour per acting account (429 `rate_limited`).

```bash
# Issue a reset link for a member (token-authenticated script: never challenged)
curl -sS -X POST "$OT/api/v1/users/$ID/password-reset" -H "Authorization: Bearer $TOKEN"
# 201 {"expiresAt":1760086400000,"link":"https://todo.example.com/reset/otr_…"}

curl -sS -X POST "$OT/api/v1/users/$OWNER_ID/deactivate" -H "Authorization: Bearer $TOKEN"
# 409 {"error":{"code":"self_action","message":"you cannot do this to your own account"}}
```

### Backups

Scheduled backups of the whole server (see [backups.md](backups.md)). Every route needs authentication (401 `unauthorized`) and the `owner` role (403 `forbidden` for members). Backup settings, runs and secrets are server-level data: they never sync to devices and are not part of the export.

**Settings** — `GET /api/v1/backups/settings`:

```json
{
  "settings": {
    "destination": "s3",
    "local": { "dir": "" },
    "s3": { "endpoint": "https://s3.eu-central-1.amazonaws.com", "region": "eu-central-1", "bucket": "my-backups",
            "prefix": "opentodo", "accessKey": "AKIA…", "pathStyle": false },
    "webdav": { "url": "", "username": "", "allowHttp": false },
    "schedule": { "frequency": "daily", "time": "03:00", "weekday": 0 },
    "retention": { "keepLast": 7, "maxAgeDays": 0 },
    "compress": true,
    "scheduleSince": 1760000000000
  },
  "secrets": { "hasS3SecretKey": true, "hasWebdavPassword": false, "hasPassphrase": true }
}
```

| Field | Notes |
| --- | --- |
| `destination` | `local`, `s3` or `webdav` (default `local`) |
| `local.dir` | absolute path; empty means `<data>/backups` |
| `s3.*` | `endpoint` (http(s) URL), `bucket` and `accessKey` are required for `s3`; `region` defaults to `us-east-1`; `pathStyle` for MinIO, Garage and most self-hosted stores |
| `webdav.*` | `url` is required for `webdav`; plain `http://` is refused unless `allowHttp` is true (the password would travel unencrypted) |
| `schedule.frequency` | `off` (default), `hourly`, `daily`, `weekly`, in the server's time zone |
| `schedule.time` | `HH:MM`; `hourly` uses the minutes only |
| `schedule.weekday` | 0 (Sunday) … 6 (Saturday), for `weekly` |
| `retention.keepLast` | at least 1 (default 7) |
| `retention.maxAgeDays` | 0 = no age limit |
| `compress` | gzip the archive (default true) |
| `scheduleSince` | read-only: when the current schedule was set |

**Update** — `PUT /api/v1/backups/settings` replaces the settings. Secrets go in an optional `secrets` object: a key that is absent keeps the stored value, an empty string removes it, any other value replaces it.

```bash
curl -sS -X PUT "$OT/api/v1/backups/settings" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "settings": {"destination":"local","local":{"dir":""},"schedule":{"frequency":"daily","time":"03:00","weekday":0},
               "retention":{"keepLast":7,"maxAgeDays":0},"compress":true},
  "secrets": {"passphrase":"a long passphrase you will not forget"}
}'
```

Secrets are stored in `<data>/secrets/backup.json` (mode 0600) and are never returned: responses carry only the `has…` flags. Invalid input is a 400 `invalid_input` whose `error.field` names the setting (for example `s3.bucket` or `retention.keepLast`); the previous settings stay active.

**Status** — `GET /api/v1/backups`:

```json
{
  "enabled": true, "destination": "local", "encrypted": true,
  "schedule": { "frequency": "daily", "time": "03:00", "weekday": 0 },
  "running": null,
  "nextRunAt": 1760151600000,
  "lastRun": { "id": "…", "kind": "scheduled", "status": "succeeded", "startedAt": 1760065200000, "finishedAt": 1760065200412,
               "durationMs": 412, "bytes": 182344, "destination": "local: /data/backups",
               "archiveName": "opentodo-20261010-030000-4f1c0a9e.tar.gz.enc", "error": "" },
  "history": [ { "…": "the last 20 runs, newest first" } ]
}
```

`running` is the run in progress (or `null`); `status` is `running`, `succeeded` or `failed`; a failed run carries the destination's error in `error`. `nextRunAt` is `null` while the schedule is off. Runs are kept for 90 days.

**Run now** — `POST /api/v1/backups/run` → 202 `{"status":"started"}`; poll the status for the outcome. A request while a backup runs is a 409 `conflict` and starts nothing.

```bash
curl -sS -X POST "$OT/api/v1/backups/run" -H "Authorization: Bearer $TOKEN"
curl -sS "$OT/api/v1/backups" -H "Authorization: Bearer $TOKEN" | jq '.lastRun'
```

**Test destination** — `POST /api/v1/backups/test` writes a small `opentodo-probe-<ms>.txt` object to the saved destination and deletes it again → 200 `{"ok":true}`. A destination failure is a 502 `destination_error` whose message is the destination's own (for example `s3 put opentodo/opentodo-probe-…: 403 Forbidden AccessDenied: …`). The server contacts a remote destination only for a test or a run.

### Audit log

The server records security-relevant events in its own database (never synced to devices, never part of `/api/v1/export`). The owner reads, filters and exports the log; every user reads their own access events. There is no route to modify or delete an event: `PATCH`/`DELETE /api/v1/audit/{id}` answer 404 `not_found`. Events are removed only by retention pruning (and addresses only by disabling address logging).

**Event shape** (list, export and activity):

```json
{
  "id": 412, "ts": 1760000000000, "name": "token.created", "outcome": "success",
  "actorId": "<user id>", "actorEmail": "owner@example.com",
  "targetId": null, "targetEmail": null,
  "ip": null, "userAgent": "Mozilla/5.0 …",
  "details": { "token_id": "…", "token_name": "laptop script" }
}
```

`actorId` is the account that acted (null for a failed sign-in); `targetId` is the account acted upon when different. `actorEmail` / `targetEmail` come from the live account, or from the email snapshot in `details.email` when the account no longer exists. `ip` is null unless the owner enabled address logging. `userAgent` is truncated to 200 bytes. `details` only ever carries the keys below: never task or project content, passwords, token or invitation secrets, one-time or recovery codes.

| Event | Outcome | Actor / target | `details` keys |
| --- | --- | --- | --- |
| `login.succeeded` | success | actor = user | `email`, `method` (`password`, `register`, `passkey`; later `oidc`) |
| `login.failed` | failure | target = account if it exists | `email` (existing accounts only), `reason` (`wrong_password`, `unknown_account`, `rate_limited`, `unknown_passkey`, `passkey_rejected`, `passkey_counter_regression`, `deactivated`) |
| `logout` | success | actor = user | |
| `token.created`, `token.revoked` | success | actor = user | `token_id`, `token_name`; `token.created` also `token_scope` (`full` or `read`) |
| `app_password.created`, `app_password.revoked` | success | actor = user | `app_password_id`, `app_password_name` |
| `email_inbox.created`, `email_inbox.rotated` | success | actor = user | (never the secret) |
| `email_inbox.updated` | success | actor = user | `setting` (`enabled` or `allowlist`), `from`, `to` (true/false, or the number of allowlist entries; never the addresses) |
| `invitation.created` | success | actor = owner | `invitation_id`, `invited_email` (bound email, if any) |
| `invitation.accepted` | success | actor = new member | `invitation_id`, `email` |
| `invitation.revoked` | success | actor = owner | `invitation_id` |
| `settings.changed` | success | actor = owner | `setting` (`audit.retention_days`, `audit.log_ip`, `webhooks_allow_private`, `mcp.enabled`), `from`, `to` |
| `export.requested` | success | actor = user | `format` (`json`) |
| `audit.exported` | success | actor = owner | `format` (`ndjson`), `count` |
| `mfa.enrolled`, `mfa.disabled`, `mfa.reset`, `mfa.challenge_failed` | | | `method`, `reason` (emitted once `mfa-totp` ships) |
| `passkey.registered`, `passkey.deleted` | success | actor = user | `passkey_id`, `passkey_name` |
| `identity.linked`, `identity.unlinked` | | | `provider` (once `oidc-login` ships) |
| `role.changed` | success | actor = owner, target = account | `from`, `to` (account roles, or `project.<role>` for project membership) |
| `user.deactivated`, `user.reactivated` | success | actor = owner or admin, target = account | |
| `user.deleted` | success | actor = owner or admin, target = account | `email` (snapshot) |
| `password.reset_issued` | success | actor = owner or admin (none from the server shell), target = account | `reset_id` |
| `password.reset_completed` | success | actor = account | `reset_id` |
| `password.changed` | success | actor = user | |
| `owner.transferred` | success | actor = previous owner, target = new owner | `from` (`owner`), `to` (`admin`): the previous owner's role change |
| `backup.created` | success or failure | actor = owner for "Back up now", none for scheduled runs | `backup_id` (the run id), `reason` (`run_failed`) on failure |
| `backup.restored` | success | none (recorded by the server on its first start after `opentodo restore`) | `backup_id` (the archive file name) |

While sign-in is rate limited for an address, one `login.failed` event with reason `rate_limited` is recorded per window instead of one per refused attempt. Task and project edits are never audit events.

**List** — `GET /api/v1/audit` (owner) → `{events: [...], cursor}`, newest first. `cursor` is the id to pass as `?cursor=` for the next page, or `null` when there are no more. Query parameters, all optional:

| Parameter | Meaning |
| --- | --- |
| `name` | one event name from the table above |
| `actor`, `target` | an account id, or an email (matched case-insensitively) |
| `outcome` | `success` or `failure` |
| `from`, `to` | inclusive time bounds, Unix milliseconds or RFC 3339 |
| `cursor` | the `cursor` of the previous page |
| `limit` | page size 1–200, default 50 |

A malformed value is a 400 `invalid_input` whose message starts with the parameter name (`limit: must be between 1 and 200`).

```bash
# Failed sign-ins of the last 24 hours
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$OT/api/v1/audit?name=login.failed&from=$(( ($(date +%s) - 86400) * 1000 ))"
```

**Export** — `GET /api/v1/audit/export` (owner) with the same filters except `cursor` and `limit` → every matching event as newline-delimited JSON (`application/x-ndjson`, `Content-Disposition: attachment; filename="opentodo-audit-YYYYMMDD.ndjson"`), one event object per line, newest first. The export records an `audit.exported` event.

**Settings** — `GET /api/v1/settings/audit` (owner) → `{"retentionDays": 90, "logIp": false}`. `PUT` the same object, both fields optional: `retentionDays` is an integer 7–3650 (otherwise 400 `invalid_input`), `logIp` turns client address logging on or off. Turning it off erases every stored address in the same transaction. Each changed value is recorded as `settings.changed`; lowering retention prunes expired events immediately, and the server also prunes at startup and hourly.

**Personal activity** — `GET /api/v1/me/activity` (any signed-in user) → `{events: [...]}`: the caller's own sign-ins, failed sign-ins against their account, sign-outs and credential and token events from the last 90 days, at most 100, newest first. Events about other accounts never appear.

### Sharing

A project owner shares a project with other accounts on the same server by exact email (OpenSpec `project-sharing`). Roles:

| Role | May |
| --- | --- |
| `viewer` | read the project and its tasks |
| `editor` | also create, edit, complete and delete tasks in the project |
| `admin` | also rename, recolour and archive the project; add, re-role and remove viewers and editors |
| `owner` | everything, including deleting the project, transferring ownership and managing admins; exactly one per project |

Every route requires a session or token. A caller who is not a member gets `404 not_found`, the same as for a project that does not exist; the member's email is looked up only after the caller's role was checked, so the routes cannot be used to probe for accounts. Labels and saved views stay personal.

```sh
# Share with an existing account as editor
curl -X POST -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"email":"bob@example.com","role":"editor"}' $BASE/api/v1/projects/$P/members
# 201 {"projectId":"…","role":"owner","ownerId":"…","members":[{"userId":"…","name":"Alice","email":"alice@example.com","role":"owner"},
#      {"userId":"…","name":"Bob","email":"bob@example.com","role":"editor"}]}

curl -X POST … -d '{"email":"nobody@example.com","role":"editor"}' $BASE/api/v1/projects/$P/members
# 404 {"error":{"code":"user_not_found","message":"no account with this email exists on this server"}}

curl -X DELETE -H "Authorization: Bearer $T" $BASE/api/v1/projects/$P/members/me    # as the owner
# 409 {"error":{"code":"owner_must_transfer","message":"the owner cannot leave the project; transfer ownership to another member first"}}

curl -X POST … -d '{"userId":"<bob>"}' $BASE/api/v1/projects/$P/transfer
# 200 membership; Bob is the owner, the previous owner an admin
```

Collections, single reads and the export include the shared projects and their tasks; a shared project carries the read-only keys `role` (yours) and `owner_id`. They are ignored when sent back in a write. REST writes are checked with the same role table as sync: a refused write answers `403 forbidden` and stores nothing. A task cannot change sharing scope: `PATCH` of `project_id` to a project shared differently (or to the Inbox from a shared project) answers `400 scope_change`; create a copy in the destination and delete the original instead, which is what the web app does.

Membership changes are recorded in the audit log as `role.changed` with `from`/`to` values such as `none` → `project.editor`.

### Assignment and notifications

A task's `assignee_id` (OpenSpec `task-assignment`) is an ordinary task field: set it with `POST /api/v1/tasks` or `PATCH /api/v1/tasks/{id}`, clear it with `null`. In a shared project the assignee must be a current member; for a task in your Inbox or an unshared project it must be you. Viewers cannot assign (`403 forbidden`, like any write). A refused assignment answers `400 not_a_member` and stores nothing; the sync endpoint refuses the same operation individually with `rejected: [{"id":"…","reason":"not_a_member"}]`.

When a member leaves or is removed, the server clears `assignee_id` on every task of that project assigned to them with operations of its own (device `server`), so every member's devices see the tasks unassigned after their next sync.

Assigning a task to someone other than yourself creates an in-app notification for the assignee. Notifications are server-side account data: they are not part of the op log or the export. Read notifications older than 90 days are removed when the server starts. Both routes require a session or token (`401 unauthorized`).

| Method & path | Purpose |
| --- | --- |
| `GET /api/v1/notifications` | your notifications, newest first (at most 200), and the unread count |
| `POST /api/v1/notifications/{id}/read` | mark one of yours read (idempotent); `204`, or `404 not_found` for an unknown id or another account's notification |

```sh
curl -X PATCH -H "Authorization: Bearer $T" -d '{"assignee_id":"<bob>"}' $BASE/api/v1/tasks/$TASK
# 200 task with "assignee_id":"<bob>"

curl -X PATCH … -d '{"assignee_id":"<carol, not a member>"}' $BASE/api/v1/tasks/$TASK
# 400 {"error":{"code":"not_a_member","message":"task.assignee_id: the assignee must be a member of the task's project (or yourself for a personal task)"}}

curl -H "Authorization: Bearer $BOB" $BASE/api/v1/notifications
# 200 {"notifications":[{"id":"…","kind":"assigned","payload":{"assigneeId":"<bob>","actorId":"<alice>",
#        "actorName":"Alice","taskId":"<task>","taskTitle":"Milk","projectId":"<p>","projectName":"Home",
#        "at":1760000000000},"createdAt":1760000000000,"readAt":null}],
#      "unread":1}

curl -X POST -H "Authorization: Bearer $BOB" $BASE/api/v1/notifications/$N/read
# 204
```

`projectId` and `projectName` are omitted for a task in the Inbox.

### Trash and history

Deleting (`DELETE /api/v1/{tasks|projects}/{id}`) is a tombstone: the item goes to the Trash and can be restored by writing `deleted_at: null` (`PATCH` accepts deleted items). Deleting a project leaves its tasks' `project_id` alone; clients hide those tasks until the project is restored or purged.

History is read from the operation log. Each change set groups the field writes made at one timestamp by one device (`server` for REST writes); `from` is the previous value in timestamp order, and `lost: true` marks a write that arrived after a newer one and never became the stored value. Members of a shared project see the history of its tasks; nobody sees another account's personal items (404 `not_found`, as for unknown ids and purged items). Restoring an old value is an ordinary write, so it appears in the history too.

```sh
curl -sS "$OT/api/v1/tasks/$ID/history" -H "Authorization: Bearer $TOKEN"
# 200 {"entity":"task","id":"…","more":false,"changeSets":[
#   {"ts":1760090000000,"device":"3c54…","userId":"…","changes":[{"opId":"…","field":"title","from":null,"to":"Draft"}]},
#   {"ts":1760090500000,"device":"server","userId":"…","changes":[{"opId":"…","field":"title","from":"Draft","to":"Final"}]}]}

# Permanently delete a trashed task (its operations, values and reminders)
curl -sS -X DELETE "$OT/api/v1/tasks/$ID/purge" -H "Authorization: Bearer $TOKEN"
# 200 {"purged":{"tasks":1,"projects":0,"reminders":0}}
# 409 {"error":{"code":"not_deleted","message":"only items in the Trash can be permanently deleted; delete it first"}}
```

Purging a project also purges every task that references it; purging a task also purges its deleted subtasks. In a shared project the role table applies: editors may purge tasks, only the owner may purge the project (403 `forbidden`); emptying the Trash skips items your role cannot delete. Purge is final and cannot be undone. The server also purges items that have been in the Trash longer than `OPENTODO_TRASH_RETENTION_DAYS` (default 30, `0` disables); see [sync](sync.md#purge).

### Comments and activity

Comments (OpenSpec `comments-and-activity`) are threaded markdown notes on a task. They are stored in the operation log like tasks, in the task's sharing scope, so every route answers `404 not_found` for a task or comment you cannot read, exactly as for an unknown id. Anyone who can read the task may comment, viewers included. Only the author may edit a comment; the author, project admins and the owner may delete it (`403 forbidden` otherwise). `author_id`, `task_id` and the timestamps are set by the server and cannot be sent. `mentions` lists account ids; the server keeps only current members of the task's shared project (always none on a personal task) and notifies each newly mentioned member (`kind: "mentioned"` in `GET /api/v1/notifications`, payload `{recipientId, actorId, actorName, commentId, taskId, taskTitle, projectId?, projectName?, excerpt, at}`). Each account may create 60 comments a minute (`429 rate_limited`). Bodies are markdown; clients render a safe subset and the server never renders them.

```sh
curl -sS -X POST "$OT/api/v1/tasks/$TASK/comments" -H "Authorization: Bearer $TOKEN" \
  -d '{"body":"Whole or **skimmed**? @bob","mentions":["<bob>","<not a member>"]}'
# 201 {"author_id":"<you>","body":"Whole or **skimmed**? @bob","created_at":1760090000000,"deleted_at":null,
#      "edited_at":null,"id":"…","mentions":["<bob>"],"parent_id":null,"task_id":"<task>"}

curl -sS -X POST "$OT/api/v1/tasks/$TASK/comments" -H "Authorization: Bearer $BOB" -d '{"body":"Whole","parent_id":"<comment>"}'
# 201 reply; parent_id must be a comment on the same task (400 invalid_input otherwise)

curl -sS "$OT/api/v1/tasks/$TASK/comments" -H "Authorization: Bearer $TOKEN"
# 200 {"comments":[ …top-level comments by creation time, each followed by its replies… ]}

curl -sS -X PATCH "$OT/api/v1/comments/$C" -H "Authorization: Bearer $BOB" -d '{"body":"hijack"}'
# 403 {"error":{"code":"forbidden","message":"only the author can edit a comment; the author, project admins and the owner can delete it"}}

curl -sS -X DELETE "$OT/api/v1/comments/$C" -H "Authorization: Bearer $TOKEN"
# 204; the comment is no longer listed (devices show a placeholder in the thread)
```

Activity is derived from the operation log on request, never stored (see [sync](sync.md#activity) for the rule shared with the client). A task's activity covers the task and its comments; a project's covers its tasks, their comments and the project. Events are newest first; `cursor` is present when `more` is true and is passed back as `before` for the next page (pages never overlap). `actor` is the author's account id, `actorName` and `taskTitle` are resolved for display, `changes` lists each touched field with its old and new value (empty for comment events), `opIds` the operations the event folds.

```sh
curl -sS "$OT/api/v1/projects/$P/activity?limit=2" -H "Authorization: Bearer $TOKEN"
# 200 {"events":[
#   {"id":"…","kind":"completed","actor":"<bob>","actorName":"Bob","entity":"task","entityId":"<task>","taskId":"<task>",
#    "taskTitle":"Milk","ts":1760090500000,"opIds":["…"],"changes":[{"field":"completed_at","from":null,"to":1760090500000}]},
#   {"id":"…","kind":"commented","actor":"<you>","actorName":"Alice","entity":"comment","entityId":"<comment>",
#    "taskId":"<task>","taskTitle":"Milk","ts":1760090000000,"opIds":["…","…"],"changes":[]}],
#  "more":true,"cursor":"1760090000000:…"}
```

Kinds: `created`, `completed`, `reopened`, `deleted`, `restored`, `rescheduled`, `assigned`, `unassigned`, `moved`, `archived`, `unarchived`, `edited`, `commented`, `comment_edited`, `comment_deleted`. A malformed `before` or a `limit` outside 1–200 answers `400 invalid_input`.

### Activity feed

`GET /api/v1/activity` (OpenSpec `activity-feed`) returns events from every shared project the caller is a member of, newest first, with the same shape and the same cursor as the per-project route plus `projectId` and `projectName`. Each project's events are derived exactly as `GET /api/v1/projects/{id}/activity` derives them, so an event has the same id in both. Personal projects and the Inbox never appear (their activity is in the project view), nor do projects you are not a member of, even when named in `project`.

Query parameters, all optional:

- `cursor` — the `cursor` of the previous page (`before` is accepted too); pages never overlap.
- `limit` — 1–200, default 50.
- `project` — a project id; a project you are not a member of yields no events.
- `actor` — an account id.
- `kind` — a feed category: `completed` (completed, reopened), `created`, `commented` (commented, comment_edited, comment_deleted), `assigned` (assigned, unassigned), `rescheduled`, `other` (every other kind).

```sh
curl -sS "$OT/api/v1/activity?kind=completed&limit=1" -H "Authorization: Bearer $TOKEN"
# 200 {"events":[
#   {"id":"…","kind":"completed","actor":"<bob>","actorName":"Bob","entity":"task","entityId":"<task>","taskId":"<task>",
#    "taskTitle":"Milk","projectId":"<project>","projectName":"Home","ts":1760090500000,"opIds":["…"],
#    "changes":[{"field":"completed_at","from":null,"to":1760090500000}]}],
#  "more":true,"cursor":"1760090500000:…"}

curl -sS "$OT/api/v1/activity?cursor=junk" -H "Authorization: Bearer $TOKEN"
# 400 {"error":{"code":"invalid_input","message":"cursor must be a cursor returned by this route"}}
```

Without credentials the route answers `401 unauthorized`; an unknown `kind`, a malformed cursor or a `limit` outside 1–200 answers `400 invalid_input`. What a user has already seen is not stored by this route: it is the `project_prefs.feed_seen_at` field in the user's personal scope, written through sync like any other op (see [sync](sync.md#project-preferences-and-the-activity-feed)). REST clients may write it with `POST /api/v1/sync` but have no collection route for it.

### Import

Import tasks and projects from the app's own export, CSV, or JSON exports of other task managers. Formats, the CSV columns, mapping rules and limits are documented in [import.md](import.md). Every imported field is written to the operation log with server time and the device id `import`, so devices receive imports like any other write.

Uploads are `multipart/form-data` with a `file` part. Options go either in one `options` part holding JSON or in individual fields of the same names: `format`, `targetProject`, `timeZone`, `sections` (`label`|`ignore`), `duplicates` (`skip`|`import`), `errors` (`skip_rows`|`abort`), `existing` (`skip`|`overwrite`). The file may be at most `OPENTODO_IMPORT_MAX_MB` (default 20 MB) and 50,000 rows; these routes do not use the 4 MB JSON body limit.

**Preview** — `POST /api/v1/import/preview` writes nothing and returns:

```json
{
  "format": "csv",
  "columns": { "recognised": ["title", "project", "priority"], "ignored": ["color"] },
  "options": { "timeZone": "Europe/Rome", "sections": "label", "duplicates": "skip", "errors": "skip_rows", "existing": "skip" },
  "totals": { "rows": 100, "create": 97, "update": 0, "skip": 0, "error": 3, "possibleDuplicates": 0,
              "warnings": 1, "newProjects": 1, "newLabels": 2, "entities": 100, "written": 0, "ops": 0 },
  "rows": [
    { "row": 2, "sourceId": "…", "kind": "task", "title": "Write report", "project": "Work", "outcome": "create" },
    { "row": 35, "kind": "task", "title": "Task 34", "outcome": "error", "reason": "invalid priority \"urgent!\" (expected 1-4 or p1-p4)" },
    { "row": 40, "kind": "task", "title": "Call mom", "outcome": "skip", "reason": "possible_duplicate" },
    { "row": 41, "kind": "task", "title": "Standup", "outcome": "create", "warnings": ["recurrence dropped (not supported)"] }
  ],
  "truncated": false
}
```

`outcome` is `create`, `update`, `skip` (reason `exists`, `unchanged`, `deleted`, `already_imported` or `possible_duplicate`) or `error` (with `reason`). `row` is the line in a CSV file or the position in a JSON array; `version` is set for an own export. At most 5,000 rows are listed, those needing attention first (`truncated: true`); `totals` always counts every row.

**Start** — `POST /api/v1/import` takes the same upload, re-checks it and returns 202:

```json
{ "job": { "id": "…", "format": "csv", "status": "running", "options": { … }, "totals": { … },
           "errors": [{ "row": 35, "reason": "invalid priority \"urgent!\" (expected 1-4 or p1-p4)" }],
           "createdAt": 1760000000000, "finishedAt": null, "undoneAt": null } }
```

**Status** — `GET /api/v1/import/jobs/{id}` returns `{job}`; `status` is `running`, `done`, `failed` (with `message`, e.g. the first bad row under `abort`, or a restart) or `undone`. `totals.written` and `totals.ops` grow while the job runs. `GET /api/v1/import/jobs` lists `{jobs}` with at most 20 errors each.

**Undo** — `POST /api/v1/import/jobs/{id}/undo` soft-deletes every project, task and label the job created and returns the job with status `undone`. Calling it again is a no-op.

Errors: 400 `invalid_input` (unknown option value, unknown time zone, a `targetProject` that is not yours; no job is created), 400 `unsupported_format` (names the supported formats), 400 `invalid_file` (recognised but unreadable), 400 `bad_request` (not multipart or no `file` part), 413 `too_large` (file or row limit), 409 `conflict` (another import or undo of yours is running), 404 `not_found` (unknown job or another account's job).

```bash
curl -sS "$OT/api/v1/import/preview" -H "Authorization: Bearer $TOKEN" -F file=@tasks.csv -F timeZone=Europe/Rome
JOB=$(curl -sS "$OT/api/v1/import" -H "Authorization: Bearer $TOKEN" -F file=@tasks.csv -F timeZone=Europe/Rome | jq -r .job.id)
curl -sS "$OT/api/v1/import/jobs/$JOB" -H "Authorization: Bearer $TOKEN" | jq .job.status
curl -sS -X POST "$OT/api/v1/import/jobs/$JOB/undo" -H "Authorization: Bearer $TOKEN"
```

### CalDAV and app passwords

The CalDAV endpoint itself (`/dav/`, `/.well-known/caldav`) speaks WebDAV/CalDAV, not this JSON API; see [caldav.md](caldav.md). It authenticates only with HTTP Basic (account email plus an app password). These JSON routes manage it; all require a session or token.

| Method | Path | Who | Body / result |
| --- | --- | --- | --- |
| `GET` | `/api/v1/app-passwords` | any user | `{"appPasswords":[{"id","name","createdAt","lastUsedAt","revokedAt"}]}`, newest first, revoked ones included. Never the secret. |
| `POST` | `/api/v1/app-passwords` | any user, recent sign-in (`403 reauth_required` otherwise, like token creation) | `{"name":"iPhone"}` → `201 {"appPassword":{…},"secret":"otap_…"}`. The secret is shown only here. |
| `DELETE` | `/api/v1/app-passwords/{id}` | owner of the app password | `204`; `404 not_found` for an unknown, foreign or already revoked id. |
| `GET` | `/api/v1/settings/caldav` | any user | `{"enabled":false,"url":"https://todo.example.com/dav/","secure":true}`; `url` is what calendar apps are configured with, `secure` is false for plain http. |
| `PUT` | `/api/v1/settings/caldav` | owner | `{"enabled":true}` → the same shape. `400 invalid_input` without a boolean `enabled`, `403 forbidden` for members. Recorded as `settings.changed` (`caldav.enabled`). |

App passwords are refused by every `/api/v1` route, and API tokens, passwords and session cookies are refused by `/dav/`. Creating and revoking one records `app_password.created` / `app_password.revoked` in the audit log.

### Email to task

Each account can have a secret inbox address; mail sent to it becomes an Inbox task (see [email.md](email.md)). The feature exists only when the operator configured a mailbox with `OPENTODO_EMAIL_*`. All routes require a session or API token and act on the caller's account. No response ever contains the operator's mail server, mailbox user or password.

| Method | Path | Who | Body / result |
| --- | --- | --- | --- |
| `GET` | `/api/v1/email-inbox` | any user | `{"enabledByOperator":true,"address":"todo+k3f9…@example.com","enabled":true,"allowlist":[],"hourlyLimit":60}`. The first call creates the address (enabled). With no operator configuration: `{"enabledByOperator":false,"address":null,"enabled":false,"allowlist":[],"hourlyLimit":60}` and nothing is created. |
| `PATCH` | `/api/v1/email-inbox` | any user | `{"enabled":false}` and/or `{"allowlist":["me@example.org"]}` → the same shape. `allowlist` must be an array of at most 50 bare email addresses (stored lowercased, duplicates dropped; `[]` clears it), otherwise `400 invalid_input` and nothing changes. `409 email_disabled` when the operator has not configured email capture. |
| `POST` | `/api/v1/email-inbox/rotate` | any user | → the same shape with a new address; the old one stops working at once. `409 email_disabled` as above. |

Changes and rotations are limited to 30 per account per hour (`429 rate_limited`). They are recorded as `email_inbox.created`, `email_inbox.rotated` and `email_inbox.updated` in the audit log.

```sh
curl -s -H "Authorization: Bearer $TOKEN" https://todo.example.com/api/v1/email-inbox
# 200 {"enabledByOperator":true,"address":"todo+k3f9…@example.com","enabled":true,"allowlist":[],"hourlyLimit":60}
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"allowlist":["Me@Example.org"]}' https://todo.example.com/api/v1/email-inbox
# 200 {..., "allowlist":["me@example.org"], ...}
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"allowlist":"me@example.org"}' https://todo.example.com/api/v1/email-inbox
# 400 {"error":{"code":"invalid_input","message":"allowlist: allowlist must be a list of at most 50 email addresses"}}
```

Tasks created from mail are ordinary operations with device `server` (title, description, priority 4, created_at, position; no project, no due date), so they arrive through `POST /api/v1/sync` like any other change.

### Webhooks

Outbound webhooks notify a URL you choose when your tasks and projects change. Event list, payload format, signature verification, retries and receiver recipes are in [docs/webhooks.md](webhooks.md); this section covers the management routes. Every route requires authentication and only ever sees the caller's own webhooks: another account's webhook id answers 404 `not_found`. Webhooks are server configuration: they never go through the op log, never sync and are not in the export.

**Create** — `POST /api/v1/webhooks`:

| Field | Type | Notes |
| --- | --- | --- |
| `url` | string | `http://` or `https://`, at most 2,048 characters |
| `events` | string[] | non-empty subset of `task.created`, `task.updated`, `task.completed`, `task.reopened`, `task.deleted`, `project.created`, `project.updated`, `project.archived`, `project.deleted` |
| `projectId` | string or null | only events for this project (tasks in it, or the project itself) |
| `enabled` | boolean | default `true` |

```bash
curl -sS "$OT/api/v1/webhooks" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"url":"https://n8n.example.com/webhook/opentodo","events":["task.completed","task.created"]}'
```

Response (201):

```json
{
  "webhook": {
    "id": "…", "url": "https://n8n.example.com/webhook/opentodo", "events": ["task.created", "task.completed"],
    "projectId": null, "enabled": true, "disabledReason": null, "consecutiveFailures": 0,
    "createdAt": 1760000000000, "updatedAt": 1760000000000,
    "secret": "whsec_…"
  }
}
```

`secret` appears only in this response; store it in the receiver to verify signatures. Errors: 400 `invalid_input` naming the field (`url: url scheme must be http or https`, `events: unknown event "task.exploded"`, `events: choose at least one event`), 400 `private_target` when the host resolves only to loopback, private, link-local or other internal addresses and the owner has not allowed private targets, 409 `limit_reached` beyond 20 webhooks per account.

**Update** — `PATCH /api/v1/webhooks/{id}` with any of the fields above (`projectId: null` removes the filter). Changing `url` re-runs the private-target check. Setting `enabled: true` on a webhook the server disabled clears `disabledReason` and the failure counter.

**Read and delete** — `GET /api/v1/webhooks`, `GET /api/v1/webhooks/{id}`, `DELETE /api/v1/webhooks/{id}` (204, also deletes its delivery log and queue). `disabledReason` is `null`, or `too_many_failures` after 20 consecutive failed deliveries.

**Test** — `POST /api/v1/webhooks/{id}/test` sends a `ping` immediately (one attempt) and answers 200 `{ok, delivery}` whether or not the receiver accepted it; `ok` is true for a `2xx` answer.

**Delivery log** — `GET /api/v1/webhooks/{id}/deliveries` → `{deliveries: [...]}`, newest first, at most 100, entries older than 30 days pruned:

```json
{
  "id": "…", "webhookId": "…", "event": "task.completed", "status": "retry", "attempts": 1,
  "nextAttemptAt": 1760000030000, "statusCode": 503, "error": "HTTP 503", "responseExcerpt": "Service Unavailable",
  "durationMs": 41, "createdAt": 1760000000000, "deliveredAt": null
}
```

`status` is `pending`, `retry`, `delivered` or `failed`; `error` is `HTTP <code>`, `timeout`, `connection failed: …` or `private_target`; `responseExcerpt` holds the first kilobyte of the response body.

**Redeliver** — `POST /api/v1/webhooks/{id}/deliveries/{did}/redeliver` queues the same body under a new delivery id → 202 `{delivery}`. A delivery id that does not belong to that webhook answers 404 `not_found`.

**Owner policy** — `GET`/`PUT /api/v1/settings/webhooks` with `{"allowPrivate": true|false}` allows targets on private networks (Home Assistant or n8n on the LAN) for every account. Owner only: members get 403 `forbidden`. The optional `OPENTODO_WEBHOOKS_ALLOW_PRIVATE` environment variable presets it on the first start.

### End-to-end encryption

Optional per-account encryption of task content ([e2ee.md](e2ee.md) has the threat model). The server stores only the key record the browser produced and never decrypts. For an encrypted account, the content fields of personal data — task `title`, `description`, `ical_extra`, `notes_doc`; project, label and section `name`; view `name` and `query`; comment `body` — hold ciphertext strings in every REST read, the export and `/api/v1/sync`:

```
"enc:v1:" + base64url(nonce(12) || AES-256-GCM(utf8(plaintext)) || tag(16))
additional authenticated data = utf8(entity + "\0" + entityId + "\0" + field)
```

All other fields (`due`, `priority`, `completed_at`, `project_id`, `labels`, …) stay plaintext. Plaintext REST writes are accepted for an encrypted account; the next unlocked device re-writes them as ciphertext.

```sh
# Create the key record (version 1). Only wrapped keys and parameters: salt 16 bytes,
# wrapped keys 40 bytes each (AES-KW of a 256-bit key), base64url without padding.
curl -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"version":1,"kdf":1,"salt":"AQEBAQEBAQEBAQEBAQEBAQ","iterations":600000,"wrappedByPassphrase":"…","wrappedByRecovery":"…"}' \
  https://todo.example.com/api/v1/encryption/keys
# 201 {"keys":{"version":1,"kdf":1,"salt":"…","iterations":600000,"wrappedByPassphrase":"…","wrappedByRecovery":"…","createdAt":1760000000000,"updatedAt":1760000000000}}
# again with version 1 (another device was first):
# 409 {"error":{"code":"encryption_conflict","message":"the encryption key record was created or changed by another device; unlock with the existing passphrase"}}
# a malformed record (for example 1000 iterations):
# 400 {"error":{"code":"invalid_input","message":"iterations must be between 600000 and 10000000"}}

# A REST read of an encrypted task: ciphertext title, plaintext due date
curl -H "Authorization: Bearer $TOKEN" https://todo.example.com/api/v1/tasks/<id>
# 200 {"id":"…","title":"enc:v1:oKGio6Slpqeoqaqron0SWSy4dh8xioWkMvJuPN5GjNypnM8","due":{"date":"2026-10-11"},"priority":1,…}

# Delete superseded content operations (plaintext history) for your account
curl -X POST -H "Authorization: Bearer $TOKEN" https://todo.example.com/api/v1/encryption/purge-history
# 200 {"purged":3,"notice":"Superseded content operations were deleted from the server. Backups made before this point, …"}
# without a key record: 409 {"error":{"code":"encryption_disabled",…}}
```

Replacing the record (passphrase change, recovery reset) and `DELETE` need a fresh re-authentication on cookie sessions (403 `reauth_required`). `GET /api/v1/me` and `GET /api/v1/auth/status` carry `"encryption":{"enabled":true,"keyVersion":2}` and `"minClientVersion":1`. The export adds `"encryption"`: the key record, or `null`. Refused for encrypted accounts with 409 `encryption_enabled`: the first share of a project (`POST /api/v1/projects/{id}/members` on an unshared project) and `POST /api/v1/app-passwords`; `/dav/` answers 403. `GET /api/v1/settings/caldav` adds `"encryption": true|false` for the caller.

## Examples

Create a task due tomorrow at 9:00 in a project:

```bash
curl -sS "$OT/api/v1/tasks" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Call the plumber","priority":2,"project_id":"<project-id>","due":{"date":"2026-10-11","time":"09:00"}}'
```

A stand-up fixed to Berlin time (devices elsewhere show it converted to their zone, with `09:00 Berlin` as a hint):

```bash
curl -sS "$OT/api/v1/tasks" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Stand-up","due":{"date":"2026-10-11","time":"09:00","tz":"Europe/Berlin"}}'
# 201 {..., "due":{"date":"2026-10-11","time":"09:00","tz":"Europe/Berlin"}, ...}
curl -sS -X PATCH "$OT/api/v1/tasks/<id>" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"due":{"date":"2026-10-11","tz":"Europe/Berlin"}}'
# 400 {"error":{"code":"invalid_input","message":"invalid op: task.due tz requires time"}}
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

Save a view and pin it (the response carries `id`, `position` and the default grouping and sort; devices show it after their next sync):

```bash
curl -sS "$OT/api/v1/views" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Waiting","query":"@waiting","pinned":true}'
# 201 {"color":"#64748b","created_at":1760090000000,"group_by":"project","id":"…","kind":"list","name":"Waiting",
#      "panels":[],"pinned":true,"position":1760090000000,"query":"@waiting","sort_by":"due","sort_dir":"asc"}
```

Group it by due date with priority 1 first, then build a dashboard from it:

```bash
curl -sS -X PATCH "$OT/api/v1/views/<id>" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"group_by":"due","sort_by":"priority","sort_dir":"desc"}'
curl -sS "$OT/api/v1/views" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Morning","kind":"dashboard","panels":["<id>"],"pinned":true}'
```

An option outside the allowed set, or a query that does not parse, is refused and nothing is created:

```bash
curl -sS "$OT/api/v1/views" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"x","query":"p1","group_by":"colour"}'
# 400 {"error":{"code":"invalid_input","message":"view.group_by must be one of project, due, priority, label, none"}}
curl -sS "$OT/api/v1/views" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"x","query":"@work p1"}'
# 400 {"error":{"code":"invalid_input","message":"view.query: Expected \"\u0026\" or \"|\" before \"p1\" at position 7"}}
```

Export everything:

```bash
curl -sS "$OT/api/v1/export" -H "Authorization: Bearer $TOKEN" -o opentodo-export.json
```

The export includes saved views (`views`, deleted ones too) next to projects, tasks and labels. It resolves label ids: `tasks[].labels` holds ids and the top-level `labels` array (including deleted labels) carries their names and colours.

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
- Request bodies are limited to 4 MB, except import uploads (`OPENTODO_IMPORT_MAX_MB`, default 20 MB).
- Rate limits (per IP): `auth/login`, `auth/register`, `auth/passkey` and the invitation preview share one window of 10 per minute; `auth/passkey/options`, `auth/mfa` and `auth/reauth` each have their own window of 10 per minute; `auth/oidc/start` and `auth/oidc/callback` share a window of 20 per minute; failed `/mcp` authentications count toward the login window; invitation creation is limited to 20 per hour per account.

### Error codes

| Code | Status | Where |
| --- | --- | --- |
| `unauthorized` | 401 | any protected route without a valid session or token |
| `forbidden` | 403 | invitation management or user administration by a member, an admin acting on an admin or the owner, a role change or transfer by a non-owner; backups, audit log, audit settings, webhook policy, two-factor policy, single sign-on settings, the MCP setting or member reset by a non-owner; a write or membership change your project role does not allow |
| `reauth_required` | 403 | a sensitive route on a cookie session that has not proved its identity in the last ten minutes; see [Two-factor authentication](#two-factor-authentication) |
| `mfa_enrolment_required` | 403 | the owner's policy requires a second factor that this account has not set up yet |
| `sso_required` | 403 | password or passkey sign-in (or password registration) by a non-owner while SSO-only mode is on; see [Single sign-on](#single-sign-on) |
| `oidc_disabled` | 404 | single sign-on routes while no provider is configured |
| `oidc_state_invalid` | 400 | provider callback with a missing, forged, expired or reused state |
| `identity_taken` | 409 | linking a provider identity that belongs to another account |
| `last_credential` | 409 | unlinking the last way to sign in to the account |
| `mfa_required_by_policy` | 403 | turning off a second factor that the policy requires |
| `mfa_code_invalid` | 400/401 | wrong, reused or expired one-time or recovery code |
| `mfa_challenge_invalid` | 401 | expired or exhausted sign-in challenge: enter the password again |
| `mfa_already_enrolled` / `mfa_not_enrolled` | 409 | enrolling twice, or disabling/regenerating without a second factor |
| `user_not_found` | 404 | adding a project member by an email that has no account |
| `owner_must_transfer` | 409 | the project owner leaving the project |
| `already_member` | 409 | adding an account that is already a member of the project |
| `not_deleted` | 409 | purging a task or project that is not in the Trash |
| `scope_change` | 400 | `PATCH` of a task's `project_id` into another sharing scope |
| `not_a_member` | 400 | a task's `assignee_id` that is not a member of its project (or not you, for a personal task) |
| `bad_origin` | 403 | cookie-authenticated write from another origin; any `/mcp` request whose `Origin` is not this server |
| `insufficient_scope` | 403 | a write route or `/api/v1/sync` called with a `read` API token |
| `signup_closed` | 403 | registration without an invitation while sign-up is closed |
| `invitation_email_mismatch` | 403 | registration email differs from the invitation's bound email |
| `invitation_invalid` | 404 | unknown, expired, revoked or already accepted invitation |
| `invitation_spent` | 409 | revoking an accepted invitation |
| `self_action` | 409 | a `/users` action on your own account |
| `account_deactivated` | 403/409 | 403 at sign-in with the correct password of a deactivated account; 409 for an administrative action on a deactivated account |
| `account_active` | 409 | reactivating an active account |
| `confirmation_mismatch` | 400 | deleting an account without its email in `confirmEmail` |
| `reset_invalid` | 404 | unknown, used, expired or revoked password reset link |
| `invalid_credentials` | 401/403 | 401 for a wrong sign-in; 403 for a wrong current password at `/me/password` or `transfer-ownership` |
| `conflict` | 409 | starting or undoing an import while another import of yours runs |
| `unsupported_format` | 400 | import file in no supported format |
| `invalid_file` | 400 | import file recognised but unreadable |
| `too_large` | 413 | import file over `OPENTODO_IMPORT_MAX_MB` or 50,000 rows |
| `email_taken` | 409 | registration with an existing email |
| `conflict` | 409 | `POST /backups/run` while a backup is running |
| `destination_error` | 502 | `POST /backups/test` when the destination refuses or cannot be reached |
| `passkeys_unavailable` | 409 | any passkey route when `OPENTODO_BASE_URL` is not https or localhost |
| `invalid_input` | 400 | validation failure naming the field |
| `encryption_disabled` | 404/409 | 404 for `GET`/`DELETE /api/v1/encryption/keys` without a key record; 409 for the history purge without one |
| `encryption_conflict` | 409 | `PUT /api/v1/encryption/keys` with a version that is not the stored version + 1 (another device created or changed the record) |
| `encryption_enabled` | 409 | sharing a project for the first time, or creating a CalDAV app password, while the account uses end-to-end encryption |
| `passkey_challenge_invalid` | 400 | passkey ceremony with an expired, reused or foreign challenge; see [Passkeys](#passkeys) |
| `private_target` | 400 | webhook URL on a private, loopback or link-local network while the owner has not allowed private targets |
| `limit_reached` | 409 | more than 20 webhooks on one account |
| `not_found` | 404 | unknown id, including another account's webhook or delivery |
| `rate_limited` | 429 | too many attempts in the window; more than 60 new comments a minute on one account |
