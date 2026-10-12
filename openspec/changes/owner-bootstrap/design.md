# Design: owner bootstrap

## D1 Setup token, not a pre-created owner

Two Coolify-native options were compared:

- **Setup token** (chosen). `OPENTODO_SETUP_TOKEN=${SERVICE_PASSWORD_SETUP}` in the template. The operator copies it from Coolify's UI into the setup screen once. Nothing in the environment matters after setup, and the owner chooses their own email and password in the app as today.
- **Pre-created owner** (`OPENTODO_OWNER_EMAIL` plus `OPENTODO_OWNER_PASSWORD=${SERVICE_PASSWORD_OWNER}`, created at startup when no account exists). No setup screen, but the generated password stays in the environment after the owner changes it in the app, so Coolify's UI keeps showing a wrong credential, and the semantics on later starts (ignore? reset?) invite mistakes. It also needs an email the operator may not want to type into Coolify.

A token printed in the logs on first start (without any variable) was also considered: it protects plain Docker too, but it changes today's documented first-visit behaviour for everyone and makes the quick start depend on reading logs. It stays possible later as an opt-in.

## D2 Behaviour

- Token configured, zero accounts: `auth/status` → `setupRequired: true, setupTokenRequired: true`. `POST /auth/register` without the right `setupToken` → 403 `setup_token_invalid`, no account; with it → owner as today. Constant-time comparison; attempts count against the existing registration limiter (per address).
- Token configured, owner exists: ignored; registration follows the sign-up policy and invitations.
- Token unset or empty: unchanged.
- Validation: if set, the token must be at least 16 characters, or startup fails naming the variable (Coolify's `SERVICE_PASSWORD_*` values are long enough).

## D3 Client

The setup screen shows a "Setup token" field when `setupTokenRequired` is true, with help text: "Find it in your hosting panel, for example Coolify → this service → Environment Variables → `OPENTODO_SETUP_TOKEN`." Offline: setup needs the server anyway; no ops involved, so convergence is unaffected.

## D4 Template

`deploy/coolify/opentodo.yaml` gains `- OPENTODO_SETUP_TOKEN=${SERVICE_PASSWORD_SETUP}`. The template check must then accept `SERVICE_PASSWORD_*` as the value of this one variable (it requires `${NAME:-default}` today).

## Size

A few dozen lines of Go and TSX; no dependency; no image size change.
