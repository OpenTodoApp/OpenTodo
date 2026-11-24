# Design

## Context

Every server write (REST, the agent tools behind MCP and `/api/v1/agent`, rules, CalDAV, calendar sync) goes through `sync.Service.ApplyStrict`: one refused op refuses the batch with a `*RejectedError`. Devices sync through `Apply`, which refuses ops one by one and is how offline history arrives. The app's check is `exceptionOn` (`web/src/lib/recurring.ts`); its server port of the series planning is `internal/sync/occurrences.go`, pinned with the web by `series.fixture.json`.

## Decisions

**D1. One check in ApplyStrict, after the batch is written.** In a strict batch, `store` remembers each existing task whose `due` it writes and the due date it had before (`noteDueWrite`); tasks the batch creates (a `created_at` op) are left out, since they have no records yet and a new piece of a split takes the date its plan chose. After the last op, still inside the transaction, `checkSeriesMoves` reads each such task as the batch left it: an open series with a calendar rule whose due date changed and whose new date `ExceptionOn` finds taken refuses the batch with `ReasonSeriesDateTaken`, the rejected op being the task's last due op and `Detail` the date and `done`, `skipped` or `moved`. The transaction rolls back. Reading the final rows means a batch that trashes the record and moves the series onto its date (an undo) passes, and the order of ops in a batch does not matter.

**D2. Never on the sync path.** `Apply` keeps storing such ops: a device that replays history must converge, and the repair (`PlanRepair`, `planRepair`) moves the series on everywhere. Refusing there would make a device's own offline edit bounce back and split the log from what devices hold.

**D3. Same rule, shared vectors.** `ExceptionOn(id, row, date, tasks)` ports `exceptionOn`: "" for a task that is not an open series or repeats after completion, else the state of the lineage record on that date, or done for an earlier piece that completed there. The fixture gains `exception_on` cases (done, skipped, moved, a free earlier date, a legacy record, a rule after completion, a completed task, a record of an earlier piece, an earlier piece completed on its last date) run by both `series.fixture.test.ts` and `series_fixture_test.go`.

**D4. The rows read.** Inside the transaction, from `scope_fields` of the series' scope (a lineage stays in one scope, `checkSplitFrom`): the series, the tasks with a `split_from` and the series they name, and for each piece of the lineage only the record of the date, found by its derived id (`OccurrenceID`). It runs only for a strict write that changes a series' due date.

**D5. Saying why.** `SeriesDateMessage` is the one sentence: "task.due: the occurrence of 2026-11-29 is already done, so this recurring task cannot move there; choose another date". REST (`applyREST`, every route) answers it as `409 series_date_taken`; `/api/v1/agent` maps the tool code to 409; the MCP tool error carries the code, the sentence and `items[0].date` and `.state`. `ot` prints the server's message as for any refused write. The web client gets a translated message for the code like every other server code.

## Data model

None. No op field or entity change; the check reads stored rows.

## Interface budget

No screen changes.

## Size

No dependency; one query per piece and one scan of `split_from` per refused-or-accepted series date change.
