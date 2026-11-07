# Rate limits and agent limits survive a restart

## Why

The threat model's accepted risks say: "Rate limits and agent limits live in memory and reset when the server restarts." Someone guessing passwords, or an AI agent that has used its day's budget, gets a fresh budget whenever the server restarts: an upgrade, a crash, a container rescheduled by its orchestrator. Second security wave, item 2.

## What Changes

- The server's rate limits keep their windows in SQLite as well as in memory: sign-in failures per address and per account (the account lockout), second-factor codes, re-authentication, registration, password reset, invitations, passkeys, single sign-on, public links and task pages, MCP, CalDAV, the test and send buttons, and the other per-address and per-account limits in `internal/httpapi`.
- The AI agent write limits (per token and per account: the calls of the last minute and the items of the UTC day) and the device relay's calls per minute are kept the same way, and so are the outgoing email sending limits (per recipient and for the server).
- Every check still reads and counts in memory, so a sign-in costs what it cost. A new tenant job, `limits`, writes the windows that changed at most a second later and removes the ones that ended; closing the tenant writes them once more. On start the open windows are loaded back.
- Keys are stored as hashes keyed with a per-database salt, never as the address, email or token id itself.
- In host mode each tenant keeps its limits in its own database. The host's per-client request limit (one minute, counted before a tenant opens) stays in memory; the per-tenant operation quotas already survive a restart, counted from the op log.

No new route, setting or environment variable. Not **BREAKING**: migration `0062_limit_windows.sql` is additive.

Out of scope: the host's per-client request limit, the relay's concurrency caps (calls in flight, streams per account) and the second sign-in step's challenges, which are not rate limits and do not need to outlive the process (a lost challenge only asks for the password again).

ROADMAP: advances `external-security-review` (second wave). No new item.

## Capabilities

### Modified Capabilities

- `account-access`: "Brute-force protection" no longer resets on restart.
- `mcp-server`: "Write limits" no longer reset on restart.

## Impact

- New package `internal/ratelimit` (`Store`, `Part`, `Times`); migration `0062_limit_windows.sql`.
- `internal/httpapi/ratelimit.go` (`Server.limit`, every limiter named), `internal/agenttools/limits.go` and `limits_store.go`, `internal/relay/hub.go`, `internal/mail/limiter.go`.
- `internal/tenant/services` builds the store; `internal/tenant/jobs.go` adds the `limits` job; `Tenant.Close` writes the last windows; `internal/jobs` names the job.
- Docs: `docs/security/threat-model.md`, `limits.md`, `how-we-verify.md`; changelog fragment `changelog.d/Security/persistent-limits.md`.
