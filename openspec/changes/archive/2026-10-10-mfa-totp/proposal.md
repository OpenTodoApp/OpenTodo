# Proposal

## Why

A password is one secret, and the people most likely to expose OpenTodo on the public internet are also the people whose task list contains the most about their life. Time-based one-time passwords are the universally supported second factor: every phone has an authenticator app, nothing is sent over the network by the server, and it works on a LAN-only install where passkeys cannot (passkeys need https). This change adds that second factor, the recovery codes that make it safe to rely on, an owner policy to require it, and a step-up check so that a stolen but still-open session cannot quietly mint API tokens or turn security features off.

## What Changes

- A new `mfa` capability: a signed-in user enrols a time-based one-time password with a QR code or manual key, confirms it with a first code, and receives ten single-use recovery codes shown once.
- Sign-in with a password becomes two steps for enrolled accounts: the password answer carries a short-lived challenge instead of a session, and a code or recovery code completes it. Attempts per challenge and per client address are limited. A passkey sign-in with user verification already proves possession of a device and satisfies the second factor.
- An optional "remember this device for 30 days" that skips the second step on that browser, revocable from Settings.
- Owner policy: second factor not required, required for the owner, or required for everyone. Accounts that must enrol are signed in but restricted to enrolment until they do.
- Step-up: sensitive settings actions (creating API tokens, changing the password, disabling the second factor, regenerating recovery codes, changing single sign-on or invitation settings) require a fresh re-authentication within the last ten minutes on cookie sessions.
- The owner can reset a locked-out member's second factor. API tokens are never challenged and are unaffected by policy.
- New routes under `/api/v1/mfa/...`, `/api/v1/auth/mfa`, `/api/v1/auth/reauth`, owner-only `/api/v1/settings/mfa` and `/api/v1/members/{id}/mfa/reset`, plus a Security section in Settings with the enrolment wizard.

Out of scope: SMS or email codes (no outbound network), hardware one-time-password tokens with counters, using a passkey as the only second factor on top of a password (passkeys satisfy the factor when used for sign-in; a dedicated "passkey as second step" prompt can come later), per-project policies, and self-service password reset.

This change advances ROADMAP.md section 7, "Multi-factor authentication (TOTP)".

No new mandatory environment variable: policy lives in the owner's Settings. No change to the op-log format; everything here is account data on the server. The server generates and verifies codes with its own clock and contacts nothing.

## Capabilities

### New Capabilities
- `mfa`: enrolment, recovery codes, the second sign-in step, trusted devices, owner policy, step-up re-authentication, disabling and owner reset, and the Settings surface.

### Modified Capabilities
- none. "Sign-in and sessions" in `account-access` keeps its scenarios: for accounts without a second factor nothing changes, and for enrolled accounts the successful path still ends with the same cookie. The two-step shape is specified as an additional requirement in `mfa`.

## Impact

- Server: tables `mfa_totp`, `mfa_recovery_codes`, `trusted_devices` and columns `sessions.mfa_at`, `sessions.reauth_at` (additive migrations); one-time-password generation and verification with standard-library HMAC; an in-memory login-challenge store; policy keys in the `settings` table (introduced by `oidc-login`, created here if that change is not merged first); a `requireFresh` middleware applied to the sensitive routes; eleven handler registrations.
- Web app: two-step sign-in screen, re-authentication dialog shown on `reauth_required`, Security panel with enrolment wizard, recovery codes, trusted devices and policy (owner).
- Docs: `docs/api.md`, `SECURITY.md`, `README.md`.
- Dependencies: Go none (standard library covers HMAC, base32 and constant-time compare). Web: one zero-dependency QR encoder (~4 KB gzipped) to render the enrolment code offline in the browser. Binary size unchanged within noise; memory impact negligible.
