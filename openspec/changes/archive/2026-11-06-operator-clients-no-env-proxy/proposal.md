# Backup destinations and the sign-on issuer: no environment proxy, no redirect to another host

## Why

The threat model (`docs/security/threat-model.md`, "Malicious calendar, mail or issue server") lists one gap among the clients that reach targets only the operator configures: the backup client used Go's default HTTP client, which takes a proxy from `HTTP_PROXY`/`HTTPS_PROXY` and follows up to ten redirects to any host. The single sign-on client followed no redirect but also took a proxy from the environment. Every client in `internal/outbound` refuses both. A proxy variable set for some other program, or a destination that answers with a redirect, could send archives, WebDAV credentials, signed S3 requests or the sign-on client secret to a host the operator never named. Item 6.6 of `external-security-review`.

## What Changes

- `internal/outbound` gains `OperatorTransport` (the default transport without an environment proxy) and `SameHostRedirects(max)` (redirects to the same scheme and host only).
- The backup client uses both, with at most 3 redirects. A redirect to another host, or from https to http, fails the request before anything reaches the other host.
- The sign-on client keeps refusing every redirect and uses the transport without an environment proxy.
- Operator targets keep reaching private addresses: no deny list is added, because a NAS or a local identity provider is a normal target.

**Behaviour change:** an operator who reached a backup destination or the issuer only through `HTTPS_PROXY` now connects directly. Not **BREAKING** for the op log; no new route or environment variable.

Out of scope: SMTP and IMAP (not HTTP), the assistant's three built-in providers (accepted in the threat model), a proxy setting for these clients.

ROADMAP: hardening of shipped features (`backups`, `oidc-login`), item 6.6 of `external-security-review`; no new item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backups`: destination connections go directly and redirect only within the destination.
- `oidc-login`: provider connections go directly and follow no redirect.

## Impact

- `internal/outbound/operator.go`, `internal/backup/client.go`, `internal/backup/service.go`, `internal/oidc/provider.go`.
- Tests: `internal/outbound/operator_test.go`, `internal/backup/client_test.go`, `internal/oidc/client_test.go`.
- Docs: `docs/backups.md`, `docs/self-hosting/sso.md`, `docs/security/threat-model.md`, `docs/security/how-we-verify.md`; CHANGELOG `### Security`.
- Binary size: none measurable (standard library only).
