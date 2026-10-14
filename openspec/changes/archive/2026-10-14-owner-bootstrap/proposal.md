# Owner bootstrap with a setup token

## Why

A server with no accounts lets the first visitor become the owner (`account-access` "First-run owner setup"). On Coolify and similar platforms the instance is public the moment it deploys, often first on a generated `sslip.io` address, so a stranger who opens the URL before the operator does gets the owner role and the operator has to delete the volume and start again. Coolify can generate secrets for templates (`SERVICE_PASSWORD_<NAME>`) and shows them in the service's environment variables, which gives a natural way to prove that the visitor is the operator.

## What Changes

- New optional variable `OPENTODO_SETUP_TOKEN`. When it is set and no account exists, creating the first account requires the same token; otherwise registration is refused with `setup_token_invalid` (403). Once an owner exists the token has no effect.
- `GET /api/v1/auth/status` reports `setupTokenRequired: true` while setup is pending and a token is configured, so the setup screen asks for it, with a hint where to find it (Coolify: the service's Environment Variables, `OPENTODO_SETUP_TOKEN`).
- Failed attempts share the registration rate limiter; the token is compared in constant time and never logged; the audit log records the owner creation as today.
- The Coolify template passes `OPENTODO_SETUP_TOKEN=${SERVICE_PASSWORD_SETUP}`, so every one-click deploy is protected without the operator typing anything. `docker-compose.yml` references it empty.
- Unset (the default), behaviour is unchanged: plain Docker keeps "the first visit creates the owner". No mandatory variable.

## Out of scope

- Pre-creating the owner from environment variables (`OPENTODO_OWNER_EMAIL` and a password): considered in the design and rejected for now.
- Changing who may register after setup (sign-up policy, invitations).

ROADMAP: self-hosting hardening; no ROADMAP item names this change.

## Impact

- Code: `internal/config` (variable), `internal/auth` (`Register` takes the token for the first account), `internal/httpapi` (status field, error code), `web/src/app` setup screen (token field), `deploy/coolify/opentodo.yaml`, `docker-compose.yml`, docs (`docs/self-hosting/coolify.md`, `docker.md`, README configuration table).
- API: one optional field on `POST /api/v1/auth/register` (`setupToken`), one status field, one error code. No new route, no migration, no op-log change, no dependency.
