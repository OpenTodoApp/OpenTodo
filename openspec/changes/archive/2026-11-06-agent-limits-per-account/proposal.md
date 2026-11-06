# AI agent write limits per account

## Why

The threat model (`docs/security/threat-model.md`, "Malicious AI agent or prompt injection") says the agent write limits are per token: 30 write calls a minute and 1,000 changed items a UTC day for each `agent` token. Several agent tokens, or several OAuth clients of one person, multiply them, so the budget that contains a runaway or prompt-injected agent grows with every token the person creates. Hardening item 6.5 of `external-security-review`.

## What Changes

- Every agent write (MCP write tools and the agent REST content routes, which share the counters) also counts against the account the token belongs to: at most **60** write calls a minute and **2,000** changed items a UTC day for all of one person's agent tokens together.
- The per-token limits stay as they are (30 calls a minute, 1,000 items a day, 50 items a call), so one token still cannot use the whole account budget.
- Over either limit the result is the existing `rate_limited` tool error with `retry_after_seconds`, and nothing changes. A call refused for the account counts against neither counter.
- The account limits are twice a token's so that two assistants working at the same time rarely meet them; they are fixed like the token limits.

No new route, setting or environment variable; counters stay in memory and reset on restart. Not **BREAKING**: a person with one agent token sees no difference.

Out of scope: limits that survive a restart, an owner setting for the values, and limits for the in-app assistant, which never writes on its own.

ROADMAP: hardening of the shipped `mcp-write-tools`; advances `external-security-review` (6.5). No new item.

## Capabilities

### Modified Capabilities

- `mcp-server`: "Write limits" adds the account limits.

## Impact

- `internal/agenttools/limits.go` (`AllowCallFor`, `ReserveFor`, `RefundFor`, `AccountPerMinute`, `AccountPerDay`); the limiter calls in `registry.go` and `rest.go` pass the caller's account.
- Tests: `internal/agenttools/limits_account_test.go`.
- Docs: `docs/mcp.md`, `docs/security/threat-model.md`; CHANGELOG `### Security`.
