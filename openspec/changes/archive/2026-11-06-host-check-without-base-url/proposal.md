# First-run setup checks the host when no base URL is set

## Why

The threat model (`docs/security/threat-model.md`, task 6.3 of `external-security-review`) lists DNS rebinding as not defended while `OPENTODO_BASE_URL` is unset: the origin check then compares `Origin` with the request's own `Host`, and a page under another site's name that resolves to the server passes it. Before the owner exists, with the setup code off (the default), such a page could create the owner account of a fresh server on a private network through the browser of someone on that network.

## What Changes

- While no `OPENTODO_BASE_URL` is set and no owner exists, a first registration addressed to a domain name needs the setup code from the server log, also when `OPENTODO_SETUP_CODE` is off and also over loopback. An IP address, a name without a dot (`localhost`, `nas`) and names under local-only suffixes (`.local`, `.lan`, `.home`, `.home.arpa`, `.internal`, `.corp`, `.localhost`, `.test`) need nothing, so a fresh Docker install opened by address or LAN name works as before.
- With the code off, the server generates the code while no owner, no token and no base URL exist, and prints it inside the existing start-up warning about the first visitor.
- The authentication status adds `setupCodeForHost`, and the setup screen explains the code is asked for because of the domain name and offers the IP address or `OPENTODO_BASE_URL` instead. The refusal stays 403 `setup_code_invalid`, with a message naming `OPENTODO_BASE_URL`.
- A setup token still replaces the code; with a base URL the host check is off, since the origin check already pins the host.

**Behaviour change:** a first visit under a domain name without `OPENTODO_BASE_URL` now asks for the code from the log. Not **BREAKING** for the op log; no new environment variable; one additive field in the status response.

Out of scope: a Settings warning while no base URL is set (after setup a rebound name has no session, see design), and the cookie-write `Origin` rule (`cookie-writes-need-origin`).

ROADMAP: hardening of a shipped feature (`account-access`), follow-up 6.3 of `external-security-review`.

## Capabilities

### Modified Capabilities

- `account-access`: "First-run owner setup" asks for the setup code under an unverified host while no base URL is set.

## Impact

- `internal/auth/setupcode.go`, `service.go`; `internal/httpapi/setuphost.go`, `auth_handlers.go`, `accountlock.go`; `internal/tenant/services/services.go`.
- `web/src/app/AuthScreen.tsx`, `web/src/lib/types.ts`, the six catalogues.
- Tests: `internal/auth/setupcode_test.go`, `internal/httpapi/setuphost_test.go`, `web/src/app/AuthScreen.setup.test.ts`.
- Docs: `docs/self-hosting/docker.md`, `docs/api.md`, `docs/security/threat-model.md`; CHANGELOG `### Security`.
