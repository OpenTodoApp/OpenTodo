# Tasks

Prerequisites: `routines-engine` and `routines-editor` are archived. The editor tasks (group 2) start once `routines-ai-step` part 2 (#720) is merged or closed.

## 1. Engine and vectors (PR 1)

- [ ] 1.1 Step tables (`internal/ruleval/steps.go`, `web/src/lib/rules/steps.ts`): `take.from` adds `all`, `take.n` optional (default 1); a project literal on `of` of `note_text`, `append_to_note` and `clear_note`; kinds `date` (input `date`, output Date) and `project_of` (input `task`, output Project); `create_tasks.parent` (Task, reference only; a type error next to `project`); verify `go test ./internal/ruleval/...` and `npm test -- steps`
- [ ] 1.2 Step vectors (`steps.vectors.json`): Add a comment, Start a timer and Notify me over Tasks; Take into Add a comment; Repeat with `item` into Add a comment; Pick all; take without n; `of` with a project literal; `date`; `project_of` and its for-each refusal; `parent` and `parent` with `project`; the two-lists for-each error; verify both checkers pass the same vectors (`go test ./internal/ruleval/...`, `npm test -- steps`)
- [ ] 1.3 The run (`internal/rules`): `take` with `all`; `of` literal; `date` resolved in the user's zone and day start; `project_of` with the Inbox value and `not_found` for project-only steps; `parent` through the registry's `parent_id`; Find tasks with a query or view reading completed tasks when `filter.MentionsState`; verify `go test ./internal/rules/...` (the scenarios "Waiting since today", "Meeting notes into the task's project", "Subtasks from a note", "What I finished this week", "Completed tasks")
- [ ] 1.4 Device preview (`web/src/lib/rules/preview.ts`): Pick all, `date`, `project_of`, per-task previews ("Would add 4 comments", "Would start the timer on 1 task", "Would append to 3 notes"); verify `npm test -- preview`
- [ ] 1.5 Use-case suite, engine part: `internal/rules/testdata/usecases.json` with the rows of design D12 that need only group 1 (1–13, 15, 17–29), seeded data and expected writes; `internal/rules/usecases_test.go` runs each through a real run and compares writes exactly; `web/src/lib/rules/usecases.test.ts` type-checks each with the TypeScript checker; verify `go test ./internal/rules -run TestUseCases` and `npm test -- usecases`

## 2. Editor (PR 2)

- [ ] 2.1 Wiring (`web/src/lib/rules/draft.ts`): `nearestFlowing(draft, place, input)` (item, step above, earlier outputs, trigger; `fits` includes per-task); `newStep` fills the main input with it, inside blocks too; verify `npm test -- editor` (the scenarios "Find, Pick the first, comment", "Find, Repeat for each, comment", "The trigger's task", "Inside a Repeat")
- [ ] 2.2 Pickers (`web/src/app/routines/words.tsx`): chip order item → outputs → trigger, the manual trigger shown as "the task you run it on", "Find tasks…" for task inputs, "A specific task…" folded last for one-task inputs, `InsertAbove` without Get a task, placeholder "choose which tasks"; verify a happy-dom test ("Picker order", "A list fits a one-task input")
- [ ] 2.3 Fixes (`web/src/lib/rules/fixes.ts`): "Use <nearest>" for missing and removed references, "Find tasks…" with nothing flowing, Repeat only for `for_each`, never Get a task; verify `npm test -- fixes` ("Empty task input", "Nothing flowing", "Removed step")
- [ ] 2.4 Pick card: the mode menu (first, last, first N, last N, all, the ones where), switching `take` ⇄ `filter` with the same id, "In list order · Sort first", output names; Add step shows Pick and drops Filter from the groups, search "filter" finds Pick; verify a happy-dom test ("Where", "Sort first", "Last or all of them")
- [ ] 2.5 Add step suggestions (`AddStep.tsx`): after Tasks (Change tasks, Add a comment, Pick, Sort, Count, Repeat), after Task (Change tasks, Add a comment, Get note text, Start a timer, Get the project of a task), after Lines (Create tasks, Pick, Count, Join, Sort, Add to a note), inside a Repeat by the item's type, first step by the trigger's output; Get a specific task never suggested; verify `npm test -- AddStep` ("Suggestions after tasks", "Suggestions after lines", "Not in suggestions")
- [ ] 2.6 Save error (`RoutineEditor.tsx`): cleared on every edit, "needs at least one step" only on Save without steps; verify a happy-dom test ("No stale error")
- [ ] 2.7 Sentences and names (`sentence.ts`): Pick, Get the date, Get the project of a task, Create subtasks, Get a specific task with "Always this task", "↳ each task"; the six catalogs (`web/src/locales/*.json`); verify `npm test` and `make i18n-check`
- [ ] 2.8 Stories and baselines: the Pick card in each mode, Add a comment after Pick, a Repeat with "↳ each task", the picker with "A specific task…" folded; verify `make ui-check` and `make ui-lint`
- [ ] 2.9 Use-case suite, editor part: `web/src/app/routines/usecases.test.tsx` builds rows 1, 2, 3, 4, 5, 6, 10, 15, 20, 22, 25 and 28 from an empty draft and asserts the saved steps equal the case, no `get_task`, no `{task}` literal, no "choose which tasks"; verify `npm test -- usecases`

## 3. Conditions and schedules (PR 3)

- [ ] 3.1 Condition predicate `unchanged` (`internal/ruleval` match, `web/src/lib/rules/match.ts`): the server's last-changed time from `fields.ts` per task, the device's from `clocks`; `match.vectors.json` with a last-changed time per task; verify `go test ./internal/ruleval/... ./internal/rules/...` and `npm test -- match` ("Not changed for 30 days", "A change resets it")
- [ ] 3.2 Condition rows (`ConditionFields`): "Not changed for [N] days", its live count on the device; six catalogs; verify a happy-dom test and `make ui-lint`
- [ ] 3.3 Trigger member `schedule.month_days` (Go and TypeScript validation, exactly one of `weekdays` and `month_days`), the scheduler's next firing (`internal/rules/schedule.go`) with the existing watermark; verify `go test ./internal/ruleval/... ./internal/rules/...` with a stepped clock ("Days of the month", "First and last of the month", "A day the month lacks")
- [ ] 3.4 When card: "Every month on [days]" and "the last day"; verify a happy-dom test and the When card story
- [ ] 3.5 Use-case rows 14, 16 and 30 in `usecases.json` (engine) and row 16 in the editor suite; verify `go test ./internal/rules -run TestUseCases` and `npm test -- usecases`

## 4. CLI, MCP, docs, starters, archive (PR 4)

- [ ] 4.1 `ot routine show` sentences for Pick (`pick first|last|first N|last N|all of`, `pick … where`), `date`, `project_of`, `parent`; verify `go test ./internal/cli/...`
- [ ] 4.2 MCP descriptions of `create_routine`, `update_routine` and `run_routine.task_id` (D9); verify `go test ./internal/agenttools/... ./internal/mcp/...` (description golden)
- [ ] 4.3 Docs: `docs/routines.md` (Steps and values, Pick, examples without a specific task), `docs/api.md` (kinds, inputs, `from: all`, `unchanged`, `month_days`), `docs/mcp.md`, `docs/automations.md`; verify `make docs-check`
- [x] 4.4 `routines-starters` design D3 table corrected per D11 (in the design PR), its check refusing `{task}` literals and `get_task` in starters (D2), and its dependency on this change; verify `make openspec-validate`
- [ ] 4.5 CHANGELOG entry under Unreleased, ROADMAP row, archive the change (`npx -y @fission-ai/openspec@1.13.2 archive routines-dynamic-data --yes`); verify `make openspec-validate` and `make check`
