# Security policy

## Reporting a vulnerability

Please do not open public issues for security problems. Email **raffaele.pizzari@gmail.com** with a description, reproduction steps and the version or commit you tested. You will get an acknowledgement within a few days. Fixes are released as soon as they are ready and credited to the reporter unless you prefer otherwise.

## Scope

- The server binary and container image
- The web application and its sync client
- The REST API and authentication

## Current security model (v0.1)

- Passwords are hashed with argon2id (OWASP parameters). Sessions are random 256-bit secrets stored hashed, delivered as `HttpOnly`, `SameSite=Lax` cookies (`Secure` when `OPENTODO_BASE_URL` is https).
- State-changing requests authenticated by cookie are rejected when the `Origin` header does not match the server's origin.
- API tokens are random 256-bit secrets stored hashed and shown exactly once.
- Passkeys (WebAuthn) are an optional extra credential next to the password, available only when `OPENTODO_BASE_URL` is https (or a localhost development origin). The relying-party id is that URL's host. The server stores only the credential id, the public key (ES256, Ed25519 or RS256), the signature counter and a name; it never sees a private key. Each ceremony checks a single-use, 5-minute, account-bound challenge held in memory, the exact origin, the relying-party id hash, the user-presence flag and the signature. Attestation is requested as `none` and is not verified, so authenticator make and model are not enforced. A signature counter that does not increase refuses the sign-in and flags the passkey as suspicious in Settings; counters that stay at zero (synced passkeys) are exempt. Changing the server's domain invalidates existing passkeys; the password still works.
- Two-factor authentication (TOTP, RFC 6238) is optional per account, or required by the owner for the owner or for every account. Codes are generated and verified with Go's standard library (HMAC-SHA1, 6 digits, 30-second steps, one step of tolerance, constant-time comparison). Each code is accepted at most once, and the server makes no network calls for it. The 20-byte secret is stored in the database (`mfa_totp.secret`) because the server must compute codes from it, so anyone with read access to the data directory can read it, as they could read webhook secrets. Ten single-use recovery codes (50 bits each) are shown once and stored as SHA-256 hashes. A password sign-in on an enrolled account returns a 5-minute challenge held in memory that allows five wrong codes; the second step is rate limited per address. "Remember this device" sets a separate `HttpOnly`, `SameSite=Lax` cookie (`ot_trust`, path `/api/v1/auth`, a fixed 30 days), stored hashed and revocable in Settings. Turning the second factor off, or an owner reset, forgets every remembered browser. A passkey sign-in with user verification counts as both factors. Accounts that the policy requires to enrol can still sign in, but only to enrol. Bearer tokens are never challenged and are unaffected by the policy.
- Step-up: for cookie sessions, creating API tokens or invitations, changing the two-factor policy, turning the second factor off, regenerating recovery codes and resetting a member's second factor require a password or code entered within the last ten minutes. A stolen but still-open session therefore cannot quietly mint long-lived credentials.
- Lost second factor: the owner resets a member with `POST /api/v1/members/{id}/mfa/reset`, using the account id shown in the audit log. Settings has no member list yet; that comes with `user-management`. An owner who has lost both their authenticator and their recovery codes stops the server and runs `opentodo mfa-reset [--data-dir DIR] <email>` on the host. The command needs shell access to the data directory, refuses to run while the server holds it, and records `mfa.reset` in the audit log. Re-enrol right after signing in.
- Login, registration, passkey sign-in, the second sign-in step, re-authentication and the invitation preview are rate limited per client IP; invitation creation is limited to 20 per hour per account.
- Invitation links carry a 256-bit secret stored only as a SHA-256 hash, work once, expire (1 hour to 30 days) and can be revoked; every invalid state answers the same 404.
- Responses carry a strict Content-Security-Policy, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.
- The container runs as a non-root user on a distroless base with no shell.
- Security-relevant events are recorded in an owner-visible audit log; see [What is logged](#what-is-logged).
- No telemetry or third-party requests.

Planned hardening is tracked in `ROADMAP.md`: OIDC, optional end-to-end encryption.

## What is logged

The server keeps an audit log of security-relevant events in its database (`opentodo.db` in the data directory, so it is part of every backup of that directory). The owner reads it in **Settings → Audit log** or through `GET /api/v1/audit`; every user sees their own sign-in activity in **Settings → Security**. The full event catalogue and payloads are in [docs/api.md](docs/api.md#audit-log).

Recorded today: sign-in success and failure by password or passkey (with a reason code and, for two-step sign-ins, the method such as `password+totp`), sign-out, two-factor enrolment, disabling, owner or command-line reset and wrong codes (`mfa.challenge_failed`, reason only), passkey registration and removal, API token creation and revocation, invitation creation, acceptance and revocation, audit settings, two-factor policy and webhook private-network policy changes, data exports and audit exports. Single sign-on and role events are recorded once those features ship.

Each event stores the time, the event name, the outcome, the acting and target account ids, a truncated user agent (200 bytes) and a small detail payload restricted by an allow-list in code (credential ids and names, setting names and values, reason codes, an email snapshot so history stays readable after an account is deleted).

**Never logged:** task, project or label content of any kind, passwords, API token secrets, invitation links, one-time codes or recovery codes. The email typed into a failed sign-in for an account that does not exist is not stored either. A test checks every allowed detail key against the synced entity fields and a list of secret names.

**Client addresses** are off by default. The owner can enable address logging in Settings; behind a reverse proxy the address comes from the first `X-Forwarded-For` entry, so make sure your proxy sets it. Disabling address logging erases every stored address immediately, in the same transaction as the setting change.

**Retention** defaults to 90 days (7 to 3650, set by the owner). Expired events are pruned at startup, hourly and right after the retention is lowered. There is no way to edit or delete individual events through the API; the audit log is not tamper-evident against someone with write access to the database file.

Changes that create or remove an access credential (API tokens, passkeys, invitations, settings) are written in the same database transaction as their audit event, so neither can exist without the other. Sign-ins, sign-outs and exports are recorded right after they happen; if recording fails the request still succeeds and the failure is logged to stdout at error level. Under credential stuffing, a rate-limited address produces one `rate_limited` event per minute instead of one per attempt.

## Supported versions

Only the latest release receives security fixes.
