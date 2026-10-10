# Design

## Context

Password sign-in creates a session in one step today. Sessions are cookie-based; scripts use bearer tokens. There is no notion of "how recently did this session prove identity". Passkeys (`passkeys`) and single sign-on (`oidc-login`) are planned alongside; the second factor must compose with both: a passkey sign-in with user verification is already two factors (device + biometric/PIN), and a provider sign-in delegates factor policy to the provider. The owner needs a way to require the second factor and a way to rescue a locked-out member, because there is no email channel for recovery.

## Goals / Non-Goals

**Goals:**
- Standard time-based one-time passwords that work with any authenticator app, generated and verified with the standard library.
- Recovery that does not depend on email: recovery codes plus owner reset.
- A reusable "fresh authentication" notion for sensitive actions.
- Policy without lock-out: enrolment-restricted sessions instead of refused sign-ins.

**Non-Goals:**
- SMS/email codes, counter-based hardware tokens, per-project policy, password reset flows.

## Decisions

### D1. One-time passwords with the standard library
Secrets are 20 random bytes, base32 encoded for the provisioning URI (`otpauth://totp/OpenTodo:<email>?secret=…&issuer=OpenTodo&algorithm=SHA1&digits=6&period=30`). Verification uses HMAC-SHA1 over the 30-second counter with a tolerance of one step either side, constant-time comparison, and a stored `last_used_step` so a code can complete at most one authentication. No dependency; SHA1-HMAC is the interoperable default in authenticator apps and is not a collision concern in this construction.

### D2. Secret storage
The server must hold the secret in a form it can use, so it is stored in `mfa_totp.secret` inside the data directory, the same trust boundary as session and token hashes. Recovery codes are ten groups of 10 base32 characters, stored as SHA-256 hashes, compared in constant time. A future "encrypted settings at rest" change can wrap `secret` without touching this design.

### D3. Two-step login via an in-memory challenge
When a password verifies for an enrolled account and no trusted-device cookie is present, the login handler returns `{mfaRequired: true, challenge}` with status 200 and no cookie. The challenge (256-bit, 5-minute TTL, 5 attempts, bound to the user id) lives in the same in-memory store pattern as passkey challenges. `POST /api/v1/auth/mfa` consumes it. Keeping the password step separate from the code step means the existing `invalid_credentials` behaviour, the per-IP limiter and the Origin check apply unchanged.
- Alternative: accept `{email, password, code}` in one request. Rejected: clients cannot know whether to ask for a code before revealing whether the password was right, and it complicates recovery-code entry.

### D4. Session freshness columns
`sessions.mfa_at` (when the second factor was last satisfied for this session, null for none) and `sessions.reauth_at` (when the session last proved the password or a code) are added. `reauth_at` is set at sign-in and by `POST /api/v1/auth/reauth`. A `requireFresh(10 * time.Minute)` middleware wraps the sensitive routes: token creation, password change, `DELETE /api/v1/mfa/totp`, recovery regeneration, `PUT /api/v1/settings/oidc`, `PUT /api/v1/settings/mfa`, invitation creation. Bearer-token requests skip the middleware because `authenticate` already distinguishes them.

### D5. Passkeys and SSO satisfy the factor
A passkey assertion whose user-verification flag is set marks `mfa_at` on the new session, so no code is asked. A provider sign-in also sets it (factor policy is the provider's). Password sign-in on an enrolled account needs the code. This is recorded in the session, not in a global flag, so the step-up middleware can later require a stronger factor if desired.

### D6. Trusted devices
`trusted_devices(id, user_id, token_hash, user_agent, created_at, expires_at)` and an `ot_trust` HttpOnly, `SameSite=Lax`, `Secure`-when-https cookie with a 30-day lifetime. Presence of a valid trusted-device token lets the password step start the session with `mfa_at` set. Disabling, resetting or "forget all" deletes the rows. Trust is per browser profile; the sync layer is not involved.

### D7. Policy and restricted sessions
Policy keys in the `settings` table: `mfa.required = none | owner | all`. On each authenticated request, if the policy applies to the user and `mfa_totp.confirmed_at` is null, every route except `GET /api/v1/me`, `/api/v1/mfa/*`, `/api/v1/auth/reauth` and `/api/v1/auth/logout` answers 403 `mfa_enrolment_required`. The client treats that code as "route to the enrolment wizard". Sync requests fail with the same code while restricted, so offline edits queue locally and upload after enrolment, exactly as during any other outage; no data is lost and convergence is unaffected because nothing was accepted out of order.
- The `settings` table is introduced by `oidc-login`; whichever change merges first carries the migration, the other reuses it.

### D8. Owner reset
`POST /api/v1/members/{id}/mfa/reset` (owner only, fresh authentication required) deletes `mfa_totp`, recovery codes and trusted devices for the member and clears `mfa_at` on their sessions. This is the only recovery path besides recovery codes and is designed to be audited (`audit-log`).

### D9. Client
- Sign-in screen: handles `mfaRequired` by showing a code field with a "use a recovery code" toggle and a "remember this device" checkbox.
- `web/src/lib/api.ts` gets a global handler: on `reauth_required` it opens a `ReauthDialog` (password or code), posts to `auth/reauth`, then retries the original request once. On `mfa_enrolment_required` it navigates to the wizard.
- Security panel: enrolment wizard with QR rendered by a zero-dependency QR encoder (`qrcode-generator`, ~4 KB gzipped, chosen over hand-rolled Reed-Solomon code to keep the risk of a broken QR low), manual key display, confirm field, recovery codes (copy, download as text), remaining count, trusted devices list, owner policy select.
- Everything keyboard reachable; offline the panel is read-only from the cached profile.

### D10. Data model impact and footprint
Additive migrations: `mfa_totp`, `mfa_recovery_codes`, `trusted_devices`, two nullable `sessions` columns, and `settings` if not present. No change to `ops`, `fields` or the op schema; nothing is synced. Go: no new dependency, binary unchanged within noise, memory impact a small challenge map. Web: +~4 KB gzipped.

**Measured at implementation.** The client pins `qrcode-generator` at exactly `2.0.4` (MIT, no dependencies, published 2025-08-07). Minified, it is 7.0 KB gzipped, more than the ~4 KB estimate: the package is a single factory that also contains GIF and table renderers, and these cannot be tree-shaken. Only `isDark` is used, and the app draws the code as SVG. The production JS bundle went from 180.27 KB to 193.62 KB gzipped (+13.4 KB in total, of which about 6.4 KB is the change's own UI and API code) and CSS from 8.79 KB to 8.86 KB. `mfa_at` and `reauth_at` are stored in a one-to-one table, `session_auth`, instead of `sessions` columns, so that the migration stays idempotent (SQLite has no `ADD COLUMN IF NOT EXISTS`). Their meaning is unchanged.

## Risks / Trade-offs

- [User loses phone and recovery codes] → owner reset; the wizard forces the user to acknowledge saving the codes; Settings shows remaining count.
- [Owner loses their own second factor] → recovery codes; as last resort the documented procedure runs `opentodo mfa-reset <email>` locally against the data directory (a subcommand, no network exposure), recorded in docs and `audit-log`.
- [Server clock drift breaks codes] → one-step tolerance; health check documents NTP; the wizard's confirm step catches gross drift early with a clear message.
- [Step-up annoys users] → ten-minute window, only on listed sensitive routes, dialog retries the original action automatically.
- [Restricted sessions confuse sync status] → the client maps `mfa_enrolment_required` to a dedicated status message rather than a generic error.
- [Brute force on the code] → five attempts per challenge, per-IP limiter, codes consumed on use.

## Migration Plan

Additive migrations; old binaries ignore the new tables and columns. Nothing changes for accounts that do not enrol. Policy defaults to `none`.

## Open Questions

- Whether the owner should be able to require the factor only for accounts without passkeys.
- Whether to extend the trusted-device cookie lifetime on use (sliding) or keep it fixed at 30 days.
