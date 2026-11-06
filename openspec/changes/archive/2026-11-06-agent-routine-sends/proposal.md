# Proposal

## Why

The MCP guide promises that no assistant tool makes a network request or sends email ("No way out"). The routine write tools did not hold to that promise. An assistant with write access could create, change, turn on and run routines. A routine can contain steps that send content off the server: **Send a webhook** to one of the person's webhooks, **Email me** to their verified address, and **Email project members**. A routine created or run by an assistant could therefore send task text to a destination the person had set up for another purpose. This hardening comes from the external security review's threat model work (`external-security-review`).

## What Changes

- On every agent path (MCP write tools, the in-app assistant's planned change sets, `ot mcp`), routines that send content off the server stay the person's:
  - `create_routine` refuses a routine with a `webhook`, `email_me` or `email_members` step anywhere in its steps (branches and loops included), or with the legacy `webhook` action.
  - `update_routine` refuses a change when the routine would still contain such a step afterwards. That includes renaming a routine the person built with one. Taking those steps out is allowed, because what is left sends nothing.
  - `set_routine_enabled` refuses turning such a routine on. Turning it off stays allowed.
  - `run_routine` refuses running such a routine. A test (`test: true`) stays allowed: it plans every step and sends nothing.
- The refusal is `forbidden_for_agents`, the same code used for Apply without asking (`routines-ai-step`). Nothing is written.
- An assistant can still read, test, turn off and trash these routines. The person creates, edits, turns on and runs them in the app or with their own session or a `full` token.
- `docs/mcp.md` and `docs/routines.md` say this, and "No way out" now matches what the tools do.

No new environment variable. No change to the op log format or the routine model; not **BREAKING** for people. An assistant workflow that created or ran sending routines stops working by design.

Out of scope:

- Routines the person built that are started by their trigger. If such a routine fires on an event the assistant caused, such as a task the assistant created, that is the person's own automation doing what they set up.
- AI steps, which send their inputs to the owner's assistant provider. That provider is already configured, and the steps are gated by the person's consent for routines (`routines-ai-step`).
- The agent write limits on `run_routine`, which are a separate hardening.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mcp-server`: "Routine write tools" refuses routines that send a webhook or an email on the paths that would let them send, and the "Unavailable step" scenario uses an AI step.

## Impact

- `internal/agenttools/routines.go` (the check), `internal/agenttools/write_routines.go` (tool descriptions), tests in `internal/agenttools` and `internal/httpapi`.
- `docs/mcp.md`, `docs/routines.md`, CHANGELOG (Security).
- No route, schema, dependency or bundle change.
