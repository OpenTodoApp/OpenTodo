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
- Login, registration, passkey sign-in and the invitation preview are rate limited per client IP; invitation creation is limited to 20 per hour per account.
- Invitation links carry a 256-bit secret stored only as a SHA-256 hash, work once, expire (1 hour to 30 days) and can be revoked; every invalid state answers the same 404.
- Responses carry a strict Content-Security-Policy, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.
- The container runs as a non-root user on a distroless base with no shell.
- No telemetry or third-party requests.

Planned hardening is tracked in `ROADMAP.md`: OIDC, MFA, optional end-to-end encryption, audit log.

## Supported versions

Only the latest release receives security fixes.
