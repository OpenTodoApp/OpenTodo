# Routines: multi-step routines built on Automations

## Why

Automations (`automation-rules`) run one set of field changes on the task that triggered them, or on every task a schedule matches. That covers "label waiting → move to Waiting", but not the small routines people write in other apps' automation builders or in Apple Shortcuts: "every Friday at 17:00, take the lines of my Groceries note and make them tasks in Errands", "when a task gets the label waiting, count the waiting tasks and tell me when there are more than ten", "every morning, move what is overdue to today and send the list to my Home Assistant webhook". The owner brainstormed the feature (DECISIONS.md, "Routines", 2026-10-31): the user-facing name is **Routines** (not "Shortcuts", which Apple owns and OpenTodo integrates with), and it evolves Automations instead of building a parallel system, so every existing rule keeps working and shows as a one-card routine with no migration for users.

This change is the engine. `routines-editor` gives it a screen, `routines-starters` gives it starting points, `routines-ai-step` adds the AI step and device runs for encrypted accounts, and `routines-shared` lets a routine belong to a shared project.

## What Changes

- **A routine is a rule with steps.** The synced `rule` entity gains one additive field, `steps`: an ordered list of at most 20 steps, one whole value like `actions`. A step has a kind, typed inputs (literals or references to the trigger's output or an earlier step's output) and one typed output. Types: **Text, Task, Tasks, Project, Date, Number** (Tasks is a list of Task; a list of Text is shown as "Lines"). A rule without `steps` is read as a one-step routine whose step is its `actions`, so every existing rule is a valid routine and nothing is migrated. The entity, its op fields, the `rules` REST collection, the device `rule:<rule-id>` and the server tables keep their names (AGENTS.md rule 3: no field is renamed); only the interface says Routines.
- **Step catalogue** (owner-approved, design D4), planned through the agent tool registry wherever a tool exists, so validation and planning are one code path:
  - **Tasks:** Find tasks (a filter query, a saved view or a condition), Create tasks (one per line with quick-add syntax, or from fields), Change tasks (priority, due, start, deadline, energy, assignee, labels, project and section, complete or reopen, trash), Add comment, Get one task.
  - **Projects:** find, create and update a project, create sections, create labels, favourite, create a project from a library template.
  - **Notes and text:** get a task's or project's note text, append to a note, clear a note, split into lines, join, format text with chips, find and replace.
  - **Lists and logic:** filter, sort, take the first N, count, If/Otherwise, Repeat for each, Stop.
  - **Time and focus:** start and stop the timer, tracked time for a period, set today's focus or Bento slots (the rules of `web/src/lib/focusEdit.ts`).
  - **Communication:** Notify me (in-app and the user's delivery channels), Send a webhook (configured webhooks only), Email me (the account's own verified address), Email project members (shared routines only, `routines-shared`).
  - **AI** (Ask AI, Summarise) comes with `routines-ai-step`.
- **Availability:** a step is offered only when what it needs is configured and switched on (outgoing email and a verified address, a webhook, delivery channels, the Energy levels switch, time tracking, today's focus, the assistant). `GET /api/v1/me/rules/catalogue` reports each step's availability with a reason and the setting that fixes it. A saved routine whose step becomes unavailable fails at that step with that reason, and nothing after it runs. On a demo, email and webhook steps are never available.
- **Limits:** at most 20 steps (blocks at most 3 deep), 60 seconds of server time per run, 500 entities written per run, lists of at most 500 items, texts of at most 64 KB, 10 emails per routine and 20 per account per day; the existing loop protection (depth 4), the 60 runs per minute and 2,000 per day per account, the runaway pause and the 50 rules per user stay.
- **Triggers:** the existing event and time triggers, plus a `manual` trigger kind, and **Run now** for every routine: from the Routines page, the command palette (`Ctrl+K`, "Run routine…"), `ot routine run`, and a new MCP write tool `run_routine` behind the existing write gate. Siri and Shortcuts come with a later step of `apple-shortcuts` (out of scope here).
- **Plan, then write.** A run plans every step against the current data and the earlier steps' planned changes, and writes only when the whole plan succeeded, as batches through `ApplyStrict` with device `rule:<rule-id>`. A step that fails writes nothing for the run.
- **Test (dry run):** `POST /api/v1/rules/{id}/test` and a new `POST /api/v1/rules/test` for an unsaved draft return every step's planned output and changes and write nothing. A Test run started with Run now (`test: true`) is the same plan, logged as a test.
- **Run log per step.** Each run records its trigger, who it ran as, test or real, its outcome, and per step its kind, status, duration, item count, the ids it touched (at most 50) and an error code. The server stores ids, counts and status only, never text: devices render titles from local data (end-to-end encryption). Retention stays 100 runs per routine for 30 days, failed runs 90 days.
- **Undo a whole run:** `POST /api/v1/rules/{id}/runs/{run}/undo` puts back every value the run wrote that has not changed since, tombstones what it created, and says what it kept.
- **Encrypted accounts:** routines without content steps run on the server as rules do; a routine with a content step (note text, lines, formatted text, text it writes) is recorded "skipped: encrypted" until `routines-ai-step` runs it on the user's devices.
- **CLI, fully:** `ot routine list|show|runs|run [--test]|enable|disable|create|edit|rm|undo`, with `create` and `edit` reading the routine from a JSON or YAML file, table and `--json` output like every `ot` command; `ot rules` stays as an alias.
- **MCP, fully:** read tools `list_routines`, `get_routine`, `list_routine_runs`, `get_routine_run` and the resources `opentodo://routines` and `opentodo://routines/{id}`; write tools `run_routine` (with `test`), `set_routine_enabled`, `create_routine`, `update_routine`, `trash_routine`, behind the existing agent write gate (owner `mcp.writes`, the user's "Allow AI assistants to make changes", an `agent` token), with the same validation, limits and availability as the app. No routine step can create, edit or run a routine.
- **Everywhere else it travels:** REST (`/api/v1/rules` keeps every route; new run, test, catalogue, all-runs and undo routes), the export and its import (the `steps` field travels with the rule), demo instances (refused like rules), host mode (the tenant's one rules job, per-tenant limits).

Not **BREAKING**: one additive field and one additive trigger kind on an existing entity, additive columns and tables on the server, new routes behind the policy wrapper, no new environment variable. The op log format does not change.

## Out of scope

- **Fetching a URL or a feed (RSS, iCal, JSON) as a step.** AGENTS.md rule 5: outbound requests go only to targets the operator or a user configured; a routine reaches the network only through the user's existing webhooks and the owner's SMTP server. Calendar subscriptions remain the way to read other calendars.
- **Email to any address.** It would turn the server into a relay for mail the owner never wrote (spam, the owner's sender reputation) and send to targets nobody configured (rule 5). Email goes to the account's own verified address, or to a shared project's members.
- **Creating calendar events** (dated tasks already reach calendars through CalDAV, feeds and calendar sync) and **running scripts or code**.
- Loops other than "for each item of a list" inside a step, branches with an "else", sub-routines calling routines, variables written across runs.
- The editor and run screens (`routines-editor`), starters and "Describe it" (`routines-starters`), the AI step, proposals and device runs (`routines-ai-step`), shared routines (`routines-shared`).
- Siri, Shortcuts and widgets running a routine (a later step of `apple-shortcuts`).
- Routines acting on standalone notes (`notes-overview` leaves automations out; a later change).
- Email or push as a step (notification channels already deliver in-app notifications; a notify step reaches them through the existing sinks).

## Roadmap

Advances milestone **1.1 "Routines"**, item `routines-engine`, the first of five (`routines-engine` → `routines-editor` → `routines-starters` → `routines-ai-step` → `routines-shared`). GitHub issue: [#658](https://github.com/OpenTodoApp/OpenTodo/issues/658).

## Capabilities

### New Capabilities

- `routines`: steps, types and references, the step catalogue, the plan-then-write run, limits, manual runs, the dry run, the per-step run log, undoing a run, encrypted accounts, routes, demo and host mode.

### Modified Capabilities

- `automation-rules`: MODIFIED "Rule entity" (the `steps` field), "Rule validation" (the `manual` trigger and `steps`), "Attribution and undo" (the history reads "Routine (<name>)"), "Run log" (run records), "Rules routes" (new routes), "CLI commands" (`ot routines`, `ot routine run`), "Rules contact nothing new" (the webhook step).
- `mcp-server`: ADDED "Routine read tools and resources", "Routine write tools".
- `command-palette`: ADDED "Run a routine from the palette".
- `webhooks`: ADDED "Routine webhook step".
- `outgoing-email`: ADDED "Routine email".
- `notification-channels`: ADDED "Routine notices through channels".
- `filter-queries`: ADDED "Evaluation on the server for routines".

Demo and host mode are covered in `routines` "Routines on a demo and in host mode".

## Impact

- **Op schema:** `internal/sync/ops.go` (`rule.steps`, kind `kRoutineSteps`, the `manual` trigger kind); regenerated `web/src/generated/opSchema.ts`, `internal/e2ee/contentfields.go` (unchanged list: `steps` is not a content field; its text literals are envelopes, D9), the contract fixture.
- **Server:** `internal/ruleval` (step table, type checker, availability, the data steps as pure functions), `internal/rules` (planner over steps, run records, undo, the manual run, time limit), a migration `internal/store/migrations/NNNN_routines.sql`, `internal/httpapi/rules.go` (routes), `internal/agenttools` (the routine caller; the routine read and write tools), `internal/mcp` (tools, resources), `internal/filter` (an evaluator), a Go port of the focus rules, the embedded template library, `internal/webhook` (`rule.fired` gains a `routine` object), `internal/mail` (the `routine` message kind), `internal/channels` (the `routine` event), `internal/cli` (`ot routine`), `internal/tenant/jobs.go` (unchanged entry, `jobs.Rules`).
- **Web:** `web/src/lib/rules/` (types, the shared step planner, vectors `web/src/lib/rules/steps.vectors.json` with Go), `web/src/lib/types.ts` (`Rule.steps`), the palette entry; the existing rule dialog keeps editing one-step routines until `routines-editor`.
- **Size:** no new server dependency; `ot` links `go.yaml.in/yaml/v3`, already in the module graph. The step planner joins the rules chunk (lazy), about 6 KB gzip; first load unchanged. Server binary growth about 200 KB (most of it the embedded template library); a run holds at most 500 items and 64 KB per text in memory.
