# Proposal

## Why

Issue #1896: today's focus can be set in the app (Daily check, key `f`) and by the routine step "Set today's focus", but not over MCP. An assistant that plans the day has to ask the person to mark the tasks by hand. `today_summary` also does not say which tasks are in today's focus; only `waiting_for_slot` takes it into account.

## What Changes

- New write tool `set_today_focus`: up to three task ids, most important first (`[]` clears). It writes `focus_date`, `focus` and, for Bento, `focus_slots` on the user's review row through the op log, by the same rule as the routine step (`ruleval.PlanSetFocus`, which shares `focusSet.vectors.json` with `web/src/lib/focusSet.ts`), and returns the ids placed.
- Only tasks the user can see, as in the Daily check's picker and the routine step (a shared task assigned to someone else included): an unknown, deleted, foreign or hidden id is `not_found`, more than three distinct ids `-32602`; nothing is written then. The write gate of every write tool applies.
- Personal scope only, like the routine step: a token limited to workspaces gets `token_restricted`. The in-app assistant does not offer it.
- `today_summary` adds `focus`, today's focus as task ids in the app's order, and `focus_date`, the day it is for.
- No new op field, route, setting, environment variable or dependency. Not **BREAKING**.

Out of scope: setting the focus from the in-app and on-device assistants, which cannot set it yet (their review screen does not describe a focus change), tomorrow's focus (Close the day), and a REST route.

Roadmap: a gap in an existing capability; no ROADMAP.md item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`: new requirement "Set today's focus".

## Impact

- Go: `internal/agenttools` (`write_focus.go`, `read.go`), `internal/assistant` (not offered in the app), tool golden files, the device manifest, `internal/httpapi/testdata/v1_surface.json`.
- Docs: `docs/mcp.md`, `skills/opentodo-mcp/SKILL.md` and its plugin copy, the plugin's `today` skill.
- Tests: `internal/agenttools/focus_test.go`.
