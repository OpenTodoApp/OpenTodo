# Design: filter by completion date

## Context

See proposal.md (Why). The current state that shapes the approach:

- **The filter language** is a hand-written tokenizer and recursive-descent parser (`web/src/lib/filter/parse.ts`) with an evaluator that compiles a query once into a predicate (`evaluate.ts`). Date terms resolve a `DateExpr` to one `YYYY-MM-DD` against the viewer's local `today`; `created` compares the instant `created_at` by local day boundaries (`createdPred`). `mentionsState` decides the open-only default. A Go port (`internal/filter`) only accepts or rejects queries so the REST API can validate saved views; both test suites run the worked examples and the error table of `docs/filters.md`.
- **Week start** is a synced user preference resolved into a module snapshot (`currentDateTime().weekStart` in `web/src/lib/dates.ts`, `weekStartOf`), kept current by `DateTimePrefsProvider`. Every device of a user therefore resolves the same week.
- **The Completed view** filters `allTasks` (every live local row) to completed ones, sorts by `completed_at` descending and keeps 100; it renders one heading-less group.
- **Completion writes** on the client all funnel through `mutateMany` (`setTaskCompleted`, `planCompletePlain` for cascades and bulk, `recurring.ts` occurrence records, bulk reopen, history restore). On the server they reach `ApplyStrict` from REST (`writeOps`), the assistant tools (`agenttools/apply.go`, including `RecurringCompletion` records), CalDAV (`caldav_write.go`) and public link ticks (`publiclinks.go`). Ops carry the author (`Actor`), but a field on the row is what clients, exports and the API can read without the op log.
- **List endpoints.** `GET /api/v1/tasks` returns every visible task; MCP `list_tasks` has `due_from` / `due_to` (dates, inclusive) and a `timezone`; `ot list` fetches `/tasks` and filters locally.

## Goals / Non-Goals

**Goals:**
- One rule for comparing a date field with a day or a period, so `due`, `created`, `deadline`, `start` and `completed` behave alike.
- No change in meaning for any query that parsed before.
- A logbook that reaches all history without rendering thousands of rows at once.
- `completed_by` written on every completion path without each call site having to remember it.

**Non-Goals:**
- Any interface that reads `completed_by`.
- Server-side evaluation of filter queries.

## Decisions

### D1. A date expression resolves to a range of days

`resolveRange(expr, today, weekStart)` returns `{start, end}` (inclusive `YYYY-MM-DD`). Day expressions (`today`, a weekday, an ISO date, `N days`, `N days ago`) give `start = end`. Periods: `this|last|next week` is the week containing `today` (first day from `weekStart`) shifted by -1, 0 or +1 weeks, `N weeks ago` by -N; `this|last|next month` and `N months ago` are calendar months. Comparison of a day `d` with a range:

| op | matches when |
| --- | --- |
| `=` | `start <= d <= end` |
| `<`, `before` | `d < start` |
| `<=` | `d <= end` |
| `>`, `after` | `d > end` |
| `>=` | `d >= start` |

For a one-day range this is exactly today's comparison, so existing queries are unchanged. Instant fields (`created`, `completed`) convert to local midnight boundaries of `start` and `end + 1`, as `createdPred` does today. The AST stores the period (`{type: 'period', unit, offset}`), not resolved dates, so a saved view keeps meaning "last week" as weeks pass.

`N weeks` / `N months` (future) and `N week ago` in the singular are accepted only as `N week(s) ago` / `N month(s) ago`; a number must be followed by `days`, `weeks` or `months`, and `weeks` / `months` by `ago`. Error messages follow the existing pattern ("Expected "ago" after "weeks" at position 9", "Expected "week" or "month" after "last" at position 14").

- **Alternative: `N weeks ago` as a day (today minus 7N).** Rejected: `completed >= 7 days ago` already says that; the issue asks for calendar periods, which are what people mean by "last week".
- **Alternative: separate `in` operator (`completed in last week`).** Rejected: a new operator for one case, where `=` against a range reads naturally and composes with the others.

### D2. Week start comes from the context, defaulting to the preference snapshot

`FilterContext` gains an optional `weekStart` (0 = Sunday). When absent, `compile` reads `currentDateTime().weekStart`, so the Filter view, saved views, dashboards, the sidebar counts and the command palette follow the user's preference without each caller passing it; tests pass it explicitly. The Filter view passes the week start from the preference provider and keys its memo on it, so a changed preference re-evaluates.

### D3. `completed <cmp> <date>` implies completed tasks

In the parser, `completed` followed by a comparison operator or `before` / `after` is a date term on field `completed`; otherwise it stays the keyword. The predicate is `completed_at !== null` and the local-day comparison. `mentionsState` treats a `completed` date term like the keyword, so `completed >= last week` lists the completed tasks of last week instead of nothing; `!(completed >= last week)` therefore includes open tasks, consistent with `!completed`. The Go parser accepts the same forms.

### D4. Completed logbook: group by local completion day, page by 100

`web/src/lib/logbook.ts` exposes `logbookGroups(tasks, today, limit)` returning the groups for the first `limit` completions (newest first) and the total count, and `logbookHeading(date, today, prefs)` ("Today", "Yesterday", `formatDate(date, 'heading')` this year, `formatDate(date, 'long')` with the year otherwise). The view starts at 100 and **Show more** adds 100 (state resets when the route changes); the button names how many remain. Group headers use `ListGroupHeader` with the count as a note ("3 done"), collapsible per device like other date groups. Rows are the standard task rows; reopening from the logbook works as before.

**Interface budget:** the header row is unchanged and the Completed view still has no quick add, so the list starts one row of chrome below the top; no task property is added to rows; no sidebar change; no new scroll region (the button is inside the content column); no new shortcut (the button is reached with Tab and Enter, `j` / `k` move over the loaded rows).

- **Alternative: virtualised infinite scroll.** Rejected: no virtualisation exists in the app, and it would interfere with row keyboard navigation and the panel; an explicit button is predictable and keyboard reachable.

### D5. `completed_by` written beside `completed_at`

Data model impact: one additive task field `completed_by`, `kNullableString` (an account id or null), never renamed; defaults to null.

- **Client:** `mutateMany` adds `completed_by` to any task patch that writes `completed_at` without it: the signed-in account (`meta.userId`) when `completed_at` is set, `null` when it is cleared, and nothing for a creation (`created_at` in the patch) that leaves it open. Because every completion path uses `mutateMany`, cascades, bulk actions, recurring occurrence records, the assistant's confirmed proposals and history restores are covered. Copies across sharing scopes carry it (`COPY_FIELDS`). Both ops share the batch's HLC timestamp and device, so concurrent completions on two devices resolve both fields to the same winner.
- **Server:** `ApplyStrict` applies the same rule before resolving: a task `completed_at` op without a `completed_by` op for the same entity gains one with the acting user (or null), the same timestamp and device, and an id derived from the original op id (`ids.NameID`), so a retried keyed request stays a duplicate. This covers REST, the assistant tools (and their `RecurringCompletion` records), CalDAV and the email and demo paths. Public link ticks set `completed_by: null` explicitly (an anonymous visitor). The sync path (`Apply`) does not stamp: devices write it themselves.
- **Reading it:** meaningful only while `completed_at` is set. An older client that reopens a task leaves the previous value; readers ignore it on open tasks. The History tab folds the field into the completion line (it is not shown as a separate change).
- **Not content:** an account id, not user-written text, so it stays plaintext for encrypted accounts.

- **Alternative: derive the completer from the op log's actor.** Rejected: the log is purged with the Trash, is online-only for clients, and exports and the API would need a join.
- **Alternative: stamp on the server for sync ops too.** Rejected: rewriting a device's batch breaks the rule that the server stores ops as sent; devices know the user.

### D6. A completion range on list endpoints

`completed_after` and `completed_before` (REST query parameters, MCP arguments, CLI flags) take `YYYY-MM-DD` (local midnight in the request's zone: MCP `timezone`, REST `timezone` query parameter, CLI the machine's zone; default UTC for REST and MCP), an RFC 3339 time, or Unix milliseconds. The range is half-open, `completed_after <= completed_at < completed_before`, so `completed_after=2026-10-05&completed_before=2026-10-12` is one week with no overlap. Either parameter implies completed tasks only. REST answers `400 invalid_input` naming the parameter for an unparseable value or for a collection other than `tasks`; MCP answers `-32602` like other argument errors. Encrypted accounts behave as for every read tool: completion times are plaintext, titles are reported as encrypted.

## Risks / Trade-offs

- **"This week" differs between people in a shared project** with different week starts: the query is evaluated per viewer, as Today and Upcoming already are. Documented.
- **Paging only bounds rendering, not memory:** every completed task is still loaded from IndexedDB, as before (the cap was applied after loading).
- **`completed_by` can be stale on tasks reopened by an older client** → only read it when `completed_at` is set (D5).

## Migration Plan

No migration: rows without `completed_by` read as null. Rolling back leaves stored `completed_by` ops in the log, which an older server would refuse on new writes only; the web app ships with the server.
