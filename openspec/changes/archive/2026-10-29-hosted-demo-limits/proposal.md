# Limits that one client cannot use up for everyone

## Why

An internal security audit found two limits that an outsider could fill to lock everybody else out:

- **Hosted tenants (Medium, host mode).** The per-tenant request limit counted every request to a tenant, before authentication. One client without an account, sending more than the limit to any address of the tenant (even `/healthz`), made every user of that tenant get 429.
- **The demo (Medium, demo instance).** New sandboxes were limited per address, and at the live cap only sandboxes idle for 15 minutes made room. With about a hundred addresses, or one IPv6 site, an attacker could create every sandbox and keep each one active, so the demo answered "busy" for up to a day.

## What Changes

- Host mode: `requests_per_minute` counts requests per tenant **and client address** (the same address every limiter uses: trusted-proxy aware, IPv6 grouped by `/64`). A flood from one client gets 429 `limit_requests`; other clients of the tenant are unaffected. The host reads the operator's trusted proxies at start, before any tenant opens.
- Demo: the per-address sandbox creation limit groups IPv6 addresses by `/48`. At the live cap, when no sandbox has been idle for 15 minutes, the oldest sandbox created more than 15 minutes ago gives way. The whole demo creates at most twice the live cap of sandboxes per hour (503 `demo_busy`).

Not **BREAKING**: no op change, no new route, no new environment variable. The meaning of `requests_per_minute` narrows from the whole tenant to one client of it.

Out of scope: a tenant-wide request ceiling on top of the per-client one (it would bring the lockout back), CAPTCHA or proof-of-work for the demo, and grouping IPv4 addresses.

ROADMAP: hardening of shipped features (`multi-tenant-host`, `demo-mode`); no new item.

## Capabilities

### Modified Capabilities

- `multi-tenant-host`: "Per-tenant limits" counts the request rate per client.
- `demo-mode`: "Demo abuse limits" adds the eviction of the oldest sandbox, the `/48` grouping and the global creation rate.

## Impact

- `internal/host/host.go`, `internal/host/limits.go`, `internal/httpapi/clientip.go` (`ClientKey`, `ConfigureClientIdentity`, `demoAddrKey`), `internal/httpapi/demo.go`, `internal/demo/demo.go`, `internal/demo/sandbox.go`.
- Tests: `internal/host/limits_test.go`, `internal/httpapi/demo_test.go`.
- Docs: `docs/self-hosting/host-mode.md`, `docs/self-hosting/demo.md`; CHANGELOG `### Security`.
