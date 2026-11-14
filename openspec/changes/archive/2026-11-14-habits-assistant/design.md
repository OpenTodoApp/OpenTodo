# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **The server computes nothing about habits** (`habits` design D7). Agent tool results carry `habit: true` only (`internal/agenttools/data.go`), and write tools refuse the field.
- **Shared Go ports are the pattern for logic both sides need**: `internal/recurrence` mirrors `web/src/lib/recurrence.ts`, pinned by shared vectors (`docs/contracts.md`). Habit history is already lineage-aware on the device.
- **Encrypted accounts** keep content away from the server; numbers and day states are not content (`habit`, `skipped`, `tiny`, dates), titles and notes are, and reads of content go through an opted-in device (`mcp-server` "Content through an opted-in device").
- **Assistant writes are reviewed** in the app (proposals with Undo); MCP writes pass the write permission gate and its limits.

## Goals / Non-Goals

**Goals:**
- One calculation, two languages, identical results, enforced by vectors.
- Every way of logging (app, tools, route, CLI, routines) writes the same records with the same derived ids, so they converge.

**Non-Goals:**
- Storing numbers. They stay derived on every read.
- A habit-specific permission. Habits follow the task permissions and the existing write gate.

## Decisions

### D1. `internal/habits`, a port pinned by `habits.vectors.json`

A pure Go package taking the series, its lineage pieces, records and the logical today, returning day states and the numbers of `habits-home` D4. The Go tests read `web/src/lib/habits.vectors.json` in place, as `internal/recurrence` reads `web/src/lib/recurrence.vectors.json`, and the file is listed in `docs/contracts.md`. The server's logical today is the user's day start and time zone from `user_prefs`, as routines already use.

- **Alternative: ask a device (the relay).** Rejected as the main path: it fails whenever no device is online, which is exactly when an outside assistant or a script calls. The relay still serves titles and notes on encrypted accounts.

### D2. `log_habit` plans like the app

The planner maps `log_habit` to the ops the app writes: for the current occurrence (or today when the series is due earlier), the completion or skip batch that moves the series (`recurring-tasks`), with `tiny` and the note; for an earlier scheduled date, the record alone; for `clear`, a tombstone. The derived record id makes a tool's log and a device's tick of the same day converge on one row. The route and the CLI call the same planner through `ApplyStrict` and wake devices with `NotifyApplied`.

### D3. Routes

`GET /api/v1/habits`, `GET /api/v1/habits/{id}` and `POST /api/v1/habits/{id}/log`, registered with `routes.handle(..., signedIn, ...)`; the POST allows `full`, `app` and session callers, and `agent` tokens only through the write gate; `read` tokens get 403 `insufficient_scope`. Errors use the JSON envelope. The answers are `list_habits` and `get_habit` shapes, so one serializer serves MCP and REST.

### D4. Skills are prompts over existing tools

`start-habit` and `habit-check` are catalogue entries with a prompt and an allowed-tool list: `start-habit` may only propose `create_tasks` with habit fields; `habit-check` may only call `list_habits` and `get_habit` and propose changes on request. The prompt for `habit-check` instructs quoting tool numbers verbatim; the eval suite (`assistant-eval`) gets scenarios that fail when an answer states a number no tool returned. The capture skill's tool list gains `log_habit`, and its prompt receives the user's habit titles to match phrases.

### D5. Off in the assistant

The server reads `user_prefs.habits` when building the skill list and the in-app assistant's instructions: off removes both habit skills and adds no habit guidance; on or not decided includes them. MCP tool lists don't change with the preference (outside tools describe data, and the user's data includes habits).

### D6. Routine steps

Find habits outputs Tasks (habit series) and Log a habit takes a Task, a Date, a state and a Text; both are added to the step type vectors so the Go and TypeScript checkers agree. On encrypted accounts they run on a device like other steps.

## Data model impact

None. No new field; the port reads existing fields.

## Size and memory

No dependency. The port adds well under 100 KB to the binary. A `list_habits` call reads each habit's records for its lineage; with an index on `series_id` already used by occurrence queries on the server, this is one query per habit, bounded by the tool's response budget.

## Risks / Trade-offs

- **[Go and TypeScript drift]** → One vector file, both suites in `make check`, and a vector for every scenario in the specs.
- **[A model invents numbers]** → Numbers come only from tools; eval scenarios catch invented ones; answers show the server time.
- **[Logging by voice picks the wrong habit]** → Capture proposes, the user reviews; one Undo.
- **[Scripts flood the log route]** → The existing per-token rate limits and write limits apply.

## Migration Plan

None.
