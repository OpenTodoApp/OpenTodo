# Security policy

## Reporting a vulnerability

Please do not open public issues for security problems. Email **raffaele.pizzari@gmail.com** with a description, reproduction steps and the version or commit you tested. You will get an acknowledgement within a few days. Fixes are released as soon as they are ready and credited to the reporter unless you prefer otherwise.

## Scope

- The server binary and container image
- The web application, its service worker and its sync client
- The REST API, the CalDAV endpoint (`/dav/`), the MCP endpoint (`/mcp`) and authentication
- The `ot` command-line client and the browser extension in `extension/`

## Security model

### Accounts and sessions

- Passwords are hashed with argon2id (OWASP parameters). Sessions are random 256-bit secrets stored hashed, delivered as `HttpOnly`, `SameSite=Lax` cookies (`Secure` when `OPENTODO_BASE_URL` is https).
- State-changing requests authenticated by cookie are rejected when the `Origin` header does not match the server's origin.
- Sign-up is closed once the owner account exists, unless `OPENTODO_ALLOW_SIGNUP=true`. Invitation links carry a 256-bit secret stored only as a SHA-256 hash, work once, expire (1 hour to 30 days) and can be revoked; every invalid state answers the same 404.
- Accounts have one of three roles. The single **owner** (enforced by a unique index and checked in the same transaction as every role or status change; the owner row can be neither deleted nor deactivated) can do everything and is never the target of an administrative action. **Admins** invite people and deactivate, reactivate, reset or delete **members**; they cannot act on the owner or other admins, change roles or transfer ownership. **Members** have no administrative rights. Promoting and demoting is an owner decision; invitations always create members. A role change applies to the account's next request. Every administrative action is a step-up route (see below), limited to 60 per hour per acting account, and audited.
- Deactivation blocks sign-in and, in one transaction, deletes every session and API token of the account and revokes its pending invitations and unused reset links; its open live-update streams are closed at once. Its data stays on the server; its devices keep their local copy but can no longer sync. A correct password for a deactivated account answers `403 account_deactivated`; a wrong one still answers the uniform `invalid_credentials`, so deactivation is revealed only to someone who knows the password. Reactivation does not restore revoked credentials. Rolling back to a binary older than user administration would let deactivated accounts sign in again.
- Password reset links (`/reset/otr_…`) are issued by the owner or an admin, carry a 256-bit secret stored only as a SHA-256 hash, work once, expire after 24 hours (1 to 72), are revoked by a newer link or by deactivation, and reveal only the account's email. Using one replaces the password and deletes every session in one transaction; concurrent uses yield one success. API tokens survive a reset (a reset means "forgot password"); deactivate an account that may be compromised. Nothing is emailed. The owner's own reset link comes only from `opentodo reset-owner-password` on the host. Changing your own password requires the current one, signs out your other sessions and is limited to 10 per hour per account.
- Deleting an account (owner or admin, typing its email) removes its personal ops and fields, sessions, tokens, passkeys and reset links, and shared projects it owned (for every member); edits it made in other people's shared projects stay part of those projects. Audit events about it are kept with an email snapshot.

### Credentials for scripts and apps

- API tokens are random 256-bit secrets stored hashed and shown exactly once. A token is `full`, `read` or `agent`; `read` and `agent` tokens are refused on every request that can change something (`403 insufficient_scope`), including `/api/v1/sync`, creating another token, every settings route and the user's own assistant switch. Tokens created before scopes existed are `full`. An `agent` token is stored as a `read` scope plus a marker row, so a server rolled back to a version without `agent` treats it as read-only.
- CalDAV app passwords (`otap_…`) are per device, shown once, stored hashed and revocable. They work only on `/dav/` (HTTP Basic with the account email); every `/api/v1` route refuses them, and `/dav/` refuses account passwords, API tokens and session cookies. Failed attempts are rate limited.
- The MCP endpoint accepts only bearer API tokens (cookies are ignored, so a web page cannot use a browser session), refuses requests whose `Origin` is not this server and caps bodies at 1 MB. Write tools are offered only when the owner allows assistant changes, the user switched on "Allow AI assistants to make changes" and the token's scope is `agent`; `full` and `read` tokens never get them. Writes go through the op log with the caller's own sharing roles (device `agent:<token-id>`, a prefix `/api/v1/sync` refuses from devices), are limited to 50 items per call, 30 calls per minute and 1,000 items per day per token, and can all be undone: no tool deletes permanently, and `trash_tasks` accepts only tasks the same token created. No tool makes outbound requests or touches sharing, members, tokens, settings or credentials, and assistant comments send no mention notifications. See [docs/mcp.md](docs/mcp.md#prompt-injection) for the prompt-injection threat model and what remains possible.

### Passkeys

Passkeys (WebAuthn) are an optional extra credential next to the password, available only when `OPENTODO_BASE_URL` is https (or a localhost development origin). The relying-party id is that URL's host. The server stores only the credential id, the public key (ES256, Ed25519 or RS256), the signature counter and a name; it never sees a private key. Each ceremony checks a single-use, 5-minute, account-bound challenge held in memory, the exact origin, the relying-party id hash, the user-presence flag and the signature. Attestation is requested as `none` and is not verified, so authenticator make and model are not enforced. A signature counter that does not increase refuses the sign-in and flags the passkey as suspicious in Settings; counters that stay at zero (synced passkeys) are exempt. Changing the server's domain invalidates existing passkeys; the password still works.

### Two-factor authentication

- Two-factor authentication (TOTP, RFC 6238) is optional per account, or required by the owner for the owner or for every account. Codes are generated and verified with Go's standard library (HMAC-SHA1, 6 digits, 30-second steps, one step of tolerance, constant-time comparison). Each code is accepted at most once, and the server makes no network calls for it. The 20-byte secret is stored in the database (`mfa_totp.secret`) because the server must compute codes from it, so anyone with read access to the data directory can read it, as they could read webhook secrets. Ten single-use recovery codes (50 bits each) are shown once and stored as SHA-256 hashes.
- A password sign-in on an enrolled account returns a 5-minute challenge held in memory that allows five wrong codes; the second step is rate limited per address. "Remember this device" sets a separate `HttpOnly`, `SameSite=Lax` cookie (`ot_trust`, path `/api/v1/auth`, a fixed 30 days), stored hashed and revocable in Settings. Turning the second factor off, or an owner reset, forgets every remembered browser. A passkey sign-in with user verification counts as both factors, and so does a single sign-on sign-in. Accounts that the policy requires to enrol can still sign in, but only to enrol. Bearer tokens are never challenged and are unaffected by the policy.
- Lost second factor: the owner resets a member from **Settings → Users** ("Reset 2FA", `POST /api/v1/members/{id}/mfa/reset`). An owner who has lost both their authenticator and their recovery codes stops the server and runs `opentodo mfa-reset [--data-dir DIR] <email>` on the host. The command needs shell access to the data directory, refuses to run while the server holds it, and records `mfa.reset` in the audit log. Re-enrol right after signing in.

### Step-up

For cookie sessions, sensitive routes require a password or code entered (or a sign-in) within the last ten minutes, otherwise they answer `403 reauth_required`: creating API tokens, app passwords or invitations, changing your password, every user-administration action, changing the two-factor policy, turning the second factor off, regenerating recovery codes, resetting a member's second factor, changing single sign-on settings, and replacing or deleting the end-to-end encryption key record. A stolen but still-open session therefore cannot quietly mint long-lived credentials.

### Single sign-on

Single sign-on (OpenID Connect, optional, off until the owner configures a provider) uses the authorization-code flow with PKCE (S256), a single-use `state` and a `nonce` carried in a signed `HttpOnly`, `SameSite=Lax`, 10-minute cookie whose HMAC key is random per process. Identity tokens are verified with the standard library against the provider's JWKS: only RS256, PS256, ES256 and EdDSA (`none` and HMAC refused), with issuer, audience, `azp`, expiry, issued-at and nonce checked (60 s leeway). An identity is matched by issuer and subject; only an email the provider marks as verified links a first-time identity to an existing account, and never again once linked. Accounts are created through the provider only when open sign-up or the owner's provisioning switch allows it. In SSO-only mode members cannot use passwords or passkeys; the owner keeps them as break-glass (`/?owner=1`, or `OPENTODO_OIDC_SSO_ONLY=false`), and bearer tokens are unaffected. The client secret is stored in `<data>/secrets/oidc.json` (0600), outside the database and backups.

### Rate limits

Per client address: `auth/login`, `auth/register`, `auth/passkey`, the invitation preview and the password-reset routes share one window of 10 per minute; `auth/passkey/options`, `auth/mfa` and `auth/reauth` each have their own window of 10 per minute; the single sign-on start and callback routes share a window of 20 per minute; failed `/mcp` authentications count toward the sign-in window. Per account: invitation creation 20 per hour, administrative actions 60 per hour, own password changes 10 per hour, comment creation 60 per minute, email-inbox changes 30 per hour, tasks created by email 60 per hour.

### Data protection

- Optional end-to-end encryption (per account, off by default): task titles, descriptions, project, label, section and saved-view names, view queries and comments in personal data are encrypted in the browser with the Web Crypto API (AES-256-GCM bound to entity, id and field; the account key wrapped with AES-KW under a PBKDF2-SHA-256 passphrase key, 600,000 iterations, and under a random 256-bit recovery key). The server stores only the wrapped key record and never receives the passphrase, the recovery key, the account key or the plaintext of those fields; there is no server-side reset. Dates, priorities, structure, counts and timing stay visible to the server, shared projects are not encrypted, and a malicious server can still serve tampered JavaScript. Full threat model and limitations: [docs/e2ee.md](docs/e2ee.md).
- Backup archives can be encrypted (argon2id + AES-256-GCM, format `OTBK1`). Backup destination credentials and the passphrase live only in `<data>/secrets/backup.json` (0600), are never returned or logged and never archived. See [docs/backups.md](docs/backups.md).
- Permanent deletion from the Trash removes the item's operations and values from the live database; older backups still contain them.

### Web and container hardening

- Responses carry a strict Content-Security-Policy, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`. Markdown in comments is rendered by an in-house renderer to React elements: raw HTML stays text, and only http(s) and mailto links are rendered.
- The container runs as a non-root user (uid 65532) on a distroless base with no shell.
- Security-relevant events are recorded in an owner-visible audit log; see [What is logged](#what-is-logged).

### Network

No telemetry and no third-party requests. The server makes outbound requests only for features the owner or a user configures:

- **Web push**: to the push service a device's browser chose, end-to-end encrypted (RFC 8291), ids only unless the device opts in to titles. `OPENTODO_PUSH=off` disables it.
- **Webhooks**: to URLs users add, through a resolve-then-pin dialer that refuses loopback, private, link-local, metadata, CGNAT, ULA, multicast and IPv4-mapped targets unless the owner allows private networks; redirects are not followed and no environment proxy is used. See [docs/webhooks.md](docs/webhooks.md#private-network-protection).
- **Backups**: to the S3 or WebDAV destination the owner configures, only for a run or a test. Plain-http WebDAV is refused unless explicitly allowed.
- **Single sign-on**: to the configured issuer's discovery document and the token and key endpoints it names (10-second timeout, redirects not followed).
- **Email to task**: one IMAP connection to the mailbox the operator configures, over implicit TLS or STARTTLS; credentials are never sent in plaintext.

The CalDAV and MCP endpoints only answer requests. Voice capture (off by default, per device) uses the browser's own speech recognition: OpenTodo's code never records, stores or transmits audio and the server never receives audio or transcripts, only the task saved with Enter. Some browsers send the audio to their vendor's speech service; Settings states this before the feature can be switched on, and on-device recognition is requested when the browser offers it. See [docs/quick-add.md](docs/quick-add.md#privacy).

## What is logged

The server keeps an audit log of security-relevant events in its database (`opentodo.db` in the data directory, so it is part of every backup of that directory). The owner reads it in **Settings → Audit log** or through `GET /api/v1/audit`; every user sees their own sign-in activity in **Settings → Security**. The full event catalogue and payloads are in [docs/api.md](docs/api.md#audit-log).

Recorded: sign-in success and failure by password, passkey or single sign-on (with a reason code such as `wrong_password`, `deactivated`, `sso_required`, `oidc_token_invalid` or `oidc_email_unverified` and the method, such as `password+totp` or `oidc`), sign-out, linking and unlinking of provider identities, two-factor enrolment, disabling, owner or command-line reset and wrong codes (`mfa.challenge_failed`, reason only), passkey registration and removal, API token and CalDAV app password creation and revocation, email-to-task address creation, rotation and setting changes, invitation creation, acceptance and revocation, owner setting changes (audit, two-factor policy, single sign-on with the client secret only as `(changed)`, webhook private-network policy, MCP and assistant changes, CalDAV) and encryption being turned on or off, each user's "Allow AI assistants to make changes" switch, every write tool call of an AI assistant's `agent` token (`agent.write`: tool name, token id and name, number of items changed and the outcome or refusal reason, never content or entity ids), data exports and audit exports, account role changes and project membership changes, deactivation, reactivation and deletion, reset links issued and used, password changes, ownership transfers, and backup runs and restores.

Each event stores the time, the event name, the outcome, the acting and target account ids, a truncated user agent (200 bytes) and a small detail payload restricted by an allow-list in code (credential ids and names, setting names and values, reason codes, an email snapshot so history stays readable after an account is deleted).

**Never logged:** task, project or label content of any kind, passwords, API token or app password secrets, invitation or password reset links, one-time codes or recovery codes, email-to-task addresses or message content. The email typed into a failed sign-in for an account that does not exist is not stored either. A test checks every allowed detail key against the synced entity fields and a list of secret names.

**Client addresses** are off by default. The owner can enable address logging in Settings; behind a reverse proxy the address comes from the first `X-Forwarded-For` entry, so make sure your proxy sets it. Disabling address logging erases every stored address immediately, in the same transaction as the setting change.

**Retention** defaults to 90 days (7 to 3650, set by the owner). Expired events are pruned at startup, hourly and right after the retention is lowered. There is no way to edit or delete individual events through the API; the audit log is not tamper-evident against someone with write access to the database file.

Changes that create or remove an access credential (API tokens, app passwords, passkeys, invitations, settings) are written in the same database transaction as their audit event, so neither can exist without the other. Sign-ins, sign-outs and exports are recorded right after they happen; if recording fails the request still succeeds and the failure is logged to stdout at error level. Under credential stuffing, a rate-limited address produces one `rate_limited` event per minute instead of one per attempt.

## Supported versions

Only the latest release receives security fixes.
