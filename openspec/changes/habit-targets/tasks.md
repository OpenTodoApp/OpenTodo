# Tasks

## 1. Data model

- [ ] 1.1 Declare `task.habit_target`, `task.habit_period`, `task.habit_amount`, `task.habit_step` and `task.habit_unit` (content), and the entity `habit_tally` (`record_id`, `device`, `count`) in `internal/sync/ops.go`; regenerate the schema and verify `go test ./internal/sync` and the v1 surface snapshot
- [ ] 1.2 Wire `habit_tally` scope, export, trash and purge like `section` (`internal/sync/scope.go`, export, trash); verify the scope and export tests extended to tallies (`go test ./...`)
- [ ] 1.3 Add the Dexie table for tallies indexed by `record_id`; verify `npm test` in web/

## 2. Calculation

- [ ] 2.1 Add periods, met periods, period strength, period streaks, period at risk, partial days and summed tallies to `web/src/lib/habits.ts` and `internal/habits`, with new vectors (a met week, a missed week, at risk on Sunday, two devices adding, a set amount, a month target); verify both suites run every vector (`npm test`, `go test ./internal/habits`)

## 3. Screen

- [ ] 3.1 Add Times per week, Times per month and Amount to the New habit form; verify component tests for creating Gym and Water
- [ ] 3.2 Add the check button's step, Subtract and Set amount, writing the device's tally and the completion when the amount is reached; verify tests for "Eight glasses", "Reaching the amount" and "Fixing a mistake"
- [ ] 3.3 Add the target bar and amount fills to `Thread.tsx` with stories in every theme, light and dark, at 360 px; verify `make ui-check` and the announced states
- [ ] 3.4 Hide met target habits from the strip until the next period; verify a test for "Target met"

## 4. Tools and routes

- [ ] 4.1 Carry `target`, `period`, `amount`, `unit` and per-day amounts in `list_habits`, `get_habit` and the habits routes; accept `amount` and `set_amount` in `log_habit` and the log route; verify tests for "Log water from a shortcut", "Amount on a plain habit" and "Not signed in" (`go test ./internal/agenttools ./internal/httpapi`)
- [ ] 4.2 Accept target and amount fields in `create_tasks` and `update_tasks`; verify `go test ./internal/agenttools`

## 5. Docs and release

- [ ] 5.1 Update `docs/habits.md`, `docs/recurrence.md`, `docs/mcp.md`, `docs/api.md` and `docs/sync.md` (the tally entity); verify `make docs-check`
- [ ] 5.2 Add `changelog.d/Added/habit-targets.md` and verify `make repo-check`
- [ ] 5.3 Run `make check` and verify it passes
