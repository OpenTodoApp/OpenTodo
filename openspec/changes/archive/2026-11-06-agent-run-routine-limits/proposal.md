# Proposal

## Why

The agent write limits (`mcp-writes` design D5) cap an `agent` token at 1,000 changed items per UTC day. `run_routine` counted a run's writes only after the run, and it ignored whether the budget had room. So a token past its daily items could keep writing through routines, up to a routine's own 500 items per run. This hardening comes from the external security review's threat model work (`external-security-review`).

## What Changes

- Before `run_routine` starts a run that may write, the server holds what is left of the token's daily items.
  - When nothing is left, the call answers `rate_limited` with `retry_after_seconds` and the routine does not run.
  - The run may write at most what was held. A run that planned more writes nothing and is logged as failed with the reason. A run plans every step before it writes anything.
  - After the run, what it did not write goes back to the budget.
- `run_routine` with `test: true` writes nothing and is not limited.
- `docs/mcp.md` describes it.

No new environment variable. No change to the op log or the routine model; not **BREAKING**.

Out of scope:

- The 50 items per call. A routine keeps its own limit of 500 items per run (`routines-engine`), which is documented.
- Limits per account rather than per token (threat model follow-up 6.5, `agent-limits-per-account`).
- Routines started by their own trigger. They are the person's and follow the routine limits.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mcp-server`: a new requirement "Routine runs within the agent write limits".

## Impact

- `internal/agenttools` (`Limiter.Hold`/`Settle`, the run path in the registry, the `Routines.RunNow` cap), `internal/rules` (`RunRequest.MaxWrites`, the check before commit), `internal/httpapi/routines_agent.go`.
- `docs/mcp.md`, CHANGELOG (Security).
- No route, schema, dependency or bundle change.
