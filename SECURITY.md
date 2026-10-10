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
- No telemetry or third-party requests.

Planned hardening is tracked in `ROADMAP.md`: passkeys (WebAuthn), OIDC, MFA, optional end-to-end encryption, audit log.

## Supported versions

Only the latest release receives security fixes.
