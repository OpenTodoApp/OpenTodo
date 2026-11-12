# Tasks

## 1. Shared calculation

- [ ] 1.1 List `web/src/lib/habits.vectors.json` as a shared contract in `docs/contracts.md`; verify `make docs-check`
- [ ] 1.2 Write `internal/habits` (scheduled dates over a lineage, day states, kept, strength, streaks, at risk, back on track, logical today from the user's prefs) and a test that runs every vector; verify `go test ./internal/habits`

## 2. Logging

- [ ] 2.1 Plan `log_habit` in `internal/agenttools` (current occurrence completes or skips and moves the series; earlier dates write the record; clear tombstones; future dates and non-habits refused); verify unit tests for each `mcp-server` "Habit tools" scenario and a convergence test with a device op on the same day (`go test ./internal/agenttools ./internal/sync`)
- [ ] 2.2 Accept `habit`, `habit_tiny` and `habit_anchor` in `create_tasks` and `update_tasks`, refusing `habit: true` without a calendar rule; verify `go test ./internal/agenttools`

## 3. Read tools

- [ ] 3.1 Add `list_habits` and `get_habit` with untrusted-text marking, kept-away projects, encrypted placeholders and the server time; verify `go test ./internal/agenttools ./internal/mcp` and the MCP surface snapshot
- [ ] 3.2 Document the tools in `docs/mcp.md` and verify `make docs-check`

## 4. Routes and CLI

- [ ] 4.1 Register `GET /api/v1/habits`, `GET /api/v1/habits/{id}` and `POST /api/v1/habits/{id}/log` with policies in `internal/httpapi`; verify tests for "A phone shortcut logs water", "Not signed in", "Read token writes" and "Bad state", and the v1 surface snapshot (`go test ./internal/httpapi`)
- [ ] 4.2 Add `ot habits`, `ot habits show` and `ot habits log` with `--json`; verify `go test ./internal/cli` and the "Log from the terminal" scenario
- [ ] 4.3 Document the routes in `docs/api.md`, the commands in `docs/cli.md`, and logging a habit from Home Assistant and a phone shortcut in `docs/home-assistant.md` and `docs/habits.md`; verify `make docs-check`

## 5. Skills

- [ ] 5.1 Add `start-habit` and `habit-check` to the catalogue with prompts and tool lists, and `log_habit` to the capture skill; hide habit skills while `habits` is off; verify `go test ./internal/assistant/...` and a web test of the skill list with each preference value
- [ ] 5.2 Add `assistant-eval` scenarios for Start a habit, How are my habits? (fails on a number no tool returned) and capture with check-ins; verify they load with `make assistant-eval` in dry-run mode
- [ ] 5.3 Document the skills in `docs/assistant-skills.md` and verify `make docs-check`

## 6. Routines

- [ ] 6.1 Add Find habits and Log a habit to the catalogue, planner and both type checkers with new step vectors, and the Habits group in the editor while on; verify `go test ./internal/rules/...`, `npm test` in web/ and the "An evening nudge" and "A walk from a webhook" scenarios as routine tests
- [ ] 6.2 Document the steps in `docs/routines.md` and verify `make docs-check`

## 7. Release

- [ ] 7.1 Add `changelog.d/Added/habits-assistant.md` and verify `make repo-check`
- [ ] 7.2 Run `make check` and verify it passes
