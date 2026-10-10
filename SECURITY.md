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
- Login, registration and the invitation preview are rate limited per client IP; invitation creation is limited to 20 per hour per account.
- Invitation links carry a 256-bit secret stored only as a SHA-256 hash, work once, expire (1 hour to 30 days) and can be revoked; every invalid state answers the same 404.
- Responses carry a strict Content-Security-Policy, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.
- The container runs as a non-root user on a distroless base with no shell.
- Security-relevant events are recorded in an owner-visible audit log; see [What is logged](#what-is-logged).
- No telemetry or third-party requests.

Planned hardening is tracked in `ROADMAP.md`: passkeys (WebAuthn), OIDC, MFA, optional end-to-end encryption.

## What is logged

The server keeps an audit log of security-relevant events in its database (`opentodo.db` in the data directory, so it is part of every backup of that directory). The owner reads it in **Settings → Audit log** or through `GET /api/v1/audit`; every user sees their own sign-in activity in **Settings → Security**. The full event catalogue and payloads are in [docs/api.md](docs/api.md#audit-log).

Recorded today: sign-in success and failure (with a reason code), sign-out, API token creation and revocation, invitation creation, acceptance and revocation, audit settings changes, data exports and audit exports. Second-factor, passkey, single sign-on, role and backup events are recorded once those features ship.

Each event stores the time, the event name, the outcome, the acting and target account ids, a truncated user agent (200 bytes) and a small detail payload restricted by an allow-list in code (credential ids and names, setting names and values, reason codes, an email snapshot so history stays readable after an account is deleted).

**Never logged:** task, project or label content of any kind, passwords, API token secrets, invitation links, one-time codes or recovery codes. The email typed into a failed sign-in for an account that does not exist is not stored either. A test checks every allowed detail key against the synced entity fields and a list of secret names.

**Client addresses** are off by default. The owner can enable address logging in Settings; behind a reverse proxy the address comes from the first `X-Forwarded-For` entry, so make sure your proxy sets it. Disabling address logging erases every stored address immediately, in the same transaction as the setting change.

**Retention** defaults to 90 days (7 to 3650, set by the owner). Expired events are pruned at startup, hourly and right after the retention is lowered. There is no way to edit or delete individual events through the API; the audit log is not tamper-evident against someone with write access to the database file.

Changes that create or remove an access credential (API tokens, invitations, settings) are written in the same database transaction as their audit event, so neither can exist without the other. Sign-ins, sign-outs and exports are recorded right after they happen; if recording fails the request still succeeds and the failure is logged to stdout at error level. Under credential stuffing, a rate-limited address produces one `rate_limited` event per minute instead of one per attempt.

## Supported versions

Only the latest release receives security fixes.
