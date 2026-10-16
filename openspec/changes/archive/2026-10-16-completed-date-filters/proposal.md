# Filter by completion date

## Why

People want to see what they finished: "what did I get done last week", "everything I closed this month" (GitHub issue #86, "Please add a way to filter by the completion date"). Today `completed` is only a boolean keyword in the filter language (`openspec/specs/filter-queries`), the Completed view shows the latest 100 completions as one flat list with no dates (`web/src/app/TaskListView.tsx`, route `completed`), and neither the REST API nor the assistant tools can ask for tasks completed in a range. The data is already on every device: `completed_at` is an instant on every task row, and recurring completions are ordinary rows with it set. Nothing records *who* completed a task in a shared project either, so a "what did we do" list cannot later be narrowed to one person.

## What Changes

- **`completed <cmp> <date>` in the filter language.** `completed` followed by `<`, `<=`, `=`, `>=`, `>`, `before` or `after` compares the local calendar day of `completed_at`, like `created`. A completion date term implies completed tasks: it counts as mentioning the task's state, so the open-only default does not hide its matches. The bare keyword `completed` keeps its meaning.
- **Period date expressions for every date field.** `this week`, `last week`, `next week`, `this month`, `last month`, `next month`, `N weeks ago` and `N months ago` denote a range of days. Weeks start on the user's first-day-of-week preference (`date-time-preferences`). Against a range, `=` means within it, `<` / `before` before its first day, `<=` up to its last day, `>` / `after` after its last day and `>=` from its first day. A single day is the range of one day, so existing queries keep their meaning. They work with `due`, `created`, `deadline`, `start` and `completed`.
- **Completed as a logbook.** The Completed view groups completions by the local day they happened ("Today", "Yesterday", then weekday and date, with the year outside the current one), newest first, and replaces the hard cap of 100 with **Show more**, which loads the next 100 so all history is reachable.
- **`completed_by`.** A new additive task field: the account id of whoever completed the task, or null. The client writes it in the same batch as `completed_at` (including recurring occurrence records and cascaded subtasks) and clears it on reopen; server-side completions (REST, assistant tools, CalDAV, public links) stamp it the same way. It is not shown anywhere yet; the API returns it.
- **Completion range for scripts and assistants.** `GET /api/v1/tasks` accepts `completed_after` and `completed_before`; MCP `list_tasks` accepts the same arguments; `ot list` gains `--completed-after` and `--completed-before`. Each takes a `YYYY-MM-DD` date (start of that day in the given time zone), an RFC 3339 time or Unix milliseconds; the range is `[completed_after, completed_before)` and lists completed tasks only.
- **Docs.** `docs/filters.md` (grammar, terms, period table, worked examples, error table), the Filter view's usage hint, `docs/built-in-views.md`, `docs/sync.md`, `docs/api.md`, `docs/mcp.md`, `docs/cli.md`.

Out of scope:
- Showing `completed_by` in the interface (a "completed by" chip, a per-person logbook filter, a `completed by:@name` term): the field lands first so data accumulates; reading it is a later change.
- Back-filling `completed_by` for past completions from the op log: the op log is purged with the Trash and older completions stay `null` ("unknown").
- Future relative periods beyond next week and next month (`in 2 weeks`), quarters and years, and time-of-day comparisons.
- Statistics and charts over completions (`stats-and-review`).

ROADMAP: a follow-up to `filter-query-language` and `custom-views` in "Organisation, views and GTD"; adds a Shipped row `completed-date-filters`. Closes #86.

Nothing here is **BREAKING**: one additive task field in the op log (the web app ships inside the server binary, so both learn the field together; an older client ignores it and its completions simply leave `completed_by` unset), no environment variable, no dependency. Queries that parsed before parse to the same result.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `filter-queries`: date terms gain period expressions; a new `completed` date term; the state rule counts a completion date term as mentioning state.
- `web-app`: the Completed view becomes a logbook grouped by completion day with paging.
- `task-management`: a task records who completed it (`completed_by`).
- `http-api`: the task list accepts a completion range.
- `mcp-server`: `list_tasks` accepts a completion range.
- `cli-client`: `ot list` accepts a completion range.

## Impact

- **Op schema:** `task.completed_by` (`kNullableString`) in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` (`Task`, `TASK_FIELDS`), the defaults in `web/src/lib/ops.ts`; not user-written content, so not in `e2ee.ContentFields` / `CONTENT_FIELDS`.
- **Web:** `web/src/lib/filter/parse.ts` and `evaluate.ts` (period expressions, the `completed` field, week start in `FilterContext`), the Filter view's hint, `lib/ops.ts` (`mutateMany` writes `completed_by` beside `completed_at`; copies keep it), `lib/historyVersions.ts` (the bookkeeping field is not a separate change line), `lib/logbook.ts` (grouping) and the Completed branch of `TaskListView.tsx`.
- **Server:** `internal/filter` (the Go port of the parser accepts the same grammar for saved views), `internal/sync` (strict batches stamp `completed_by`), `internal/httpapi` (list parameters, public link ticks record `null`, agent REST create accepts `completed_by: null`), `internal/agenttools` (`list_tasks` arguments and output), `internal/cli` (flags).
- **Size:** no dependency. The parser and evaluator grow by about 1.5 kB minified; the logbook by under 1 kB. Go: about 250 lines; no new goroutine, memory unchanged. Binary size unchanged within rounding.
