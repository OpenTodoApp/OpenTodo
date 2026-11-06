# Tasks

## 1. Refusal

- [x] 1.1 `sendsOut` and `refuseSending` in `internal/agenttools/routines.go`: the sending step kinds anywhere in steps (branches and loops) and a non-null legacy `webhook` action. Verified by `TestSendsOut` (`go test ./internal/agenttools -run TestSendsOut`).
- [x] 1.2 `create_routine`, `update_routine` (the routine after the change), `set_routine_enabled` (on only) and `run_routine` (not a test) refuse with `forbidden_for_agents` before anything is written. Verified by `TestRoutineSendingStepsRefusedForAgents` (`go test ./internal/httpapi -run TestRoutineSendingStepsRefusedForAgents`): no rule ops, the person's routine unchanged, no run recorded; get, test, off, taking the step out and trash succeed.
- [x] 1.3 Tool descriptions say it (`internal/agenttools/write_routines.go`). `TestRoutineMCPTools`'s unavailable-step case uses Ask AI. Verified by `go test ./internal/...`.

## 2. Words

- [x] 2.1 `docs/mcp.md` ("No way out", the routine tool table and the paragraph under it) and `docs/routines.md` (Apply without asking's paragraph). Verified by `make docs-check`.
- [x] 2.2 CHANGELOG entry under Unreleased, Security. Verified by `make check`.
