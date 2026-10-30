---
title: Shared contracts
summary: The logic that exists in both Go and TypeScript, the shared fixture that keeps each pair in step, and the tests that read it.
audience: developer
section: Internals
specs: []
screens: []
order: 30
---
# Shared contracts

Some logic runs on the server and in the web app: the server needs it for REST, MCP, the CLI and imports, and the app needs it offline. Each pair is kept in step by one fixture file that a Go test and a TypeScript test both read. Change one side, run both tests; when a fixture is generated, regenerate it with the command in the table, never by hand.

`scripts/contracts.test.mjs` (in `make repo-check`) checks this table: every fixture exists, every file named under *Read in Go* and *Read in TS* exists and names its fixture, and every fixture-like file in the repository (`*.vectors.json`, `*_vectors.json`, `*_fixture.json`, `*.fixture(s).json`) is listed here or below.

| Contract | Go | TypeScript | Fixture | Read in Go | Read in TS | Written by |
| --- | --- | --- | --- | --- | --- | --- |
| Op schema (fields per entity) | `internal/sync/ops.go` | `web/src/lib/ops.ts`, `types.ts` | `internal/sync/testdata/schema_fixture.json` | `internal/sync/schema_fixture_test.go` | `web/src/lib/schemaFixture.test.ts`, `web/src/lib/entityTables.test.ts` | hand |
| Workspaces (partition of synced rows) | `internal/sync/partition.go` | `web/src/lib/workspaces.ts` | `internal/sync/testdata/workspaces_fixture.json` | `internal/sync/workspaces_test.go`, `internal/cli/workspaces_fixture_test.go` | `web/src/lib/workspaces.test.ts` | hand |
| End-to-end encryption format | `internal/e2ee`, `internal/e2ee/crypt` (CLI) | `web/src/lib/crypto.ts`, `e2ee.ts` | `web/src/lib/e2ee.vectors.json` | `internal/e2ee/vectors_test.go`, `internal/e2ee/crypt/crypt_test.go` | `web/src/lib/crypto.test.ts` | `go test ./internal/e2ee -run TestVectors -update` |
| Device relay sealing | `internal/relay` | `web/src/lib/relay.ts` | `web/src/lib/relay.vectors.json` | `internal/relay/vectors_test.go` | `web/src/lib/relay.test.ts` | `go test ./internal/relay -update` |
| Recurrence | `internal/recurrence` | `web/src/lib/recurrence.ts` | `web/src/lib/recurrence.vectors.json` | `internal/recurrence/recurrence_test.go` | `web/src/lib/recurrence.test.ts` | hand |
| Time-zone-fixed due values | `internal/zoned` | `web/src/lib/dates.ts` | `web/src/lib/zoned.vectors.json` | `internal/zoned/zoned_test.go` | `web/src/lib/dates.test.ts` | hand |
| Inherited custom fields | `internal/sync/fields.go` | `web/src/lib/fieldTree.ts` | `web/src/lib/fields.vectors.json` | `internal/sync/fields_vectors_test.go` | `web/src/lib/fields.test.ts` | hand |
| Inbox membership | `internal/inbox/inbox.go` | `web/src/lib/inbox.ts` | `web/src/lib/inbox.vectors.json` | `internal/inbox/inbox_test.go` | `web/src/lib/inbox.test.ts` | hand |
| Default reminders | `internal/defaultreminder` | `web/src/lib/defaultReminder.ts` | `web/src/lib/defaultReminder.vectors.json` | `internal/defaultreminder/defaultreminder_test.go` | `web/src/lib/defaultReminder.test.ts` | hand |
| Built-in view rules | `internal/inbox/views.go` | `web/src/lib/viewRules.ts` | `web/src/lib/views.vectors.json` | `internal/inbox/views_test.go` | `web/src/lib/viewRules.test.ts` | hand |
| Filter query parser | `internal/filter` | `web/src/lib/filter/parse.ts` | `docs/filters.md` (its examples) | `internal/filter/filter_test.go` | `web/src/lib/filter/filter.test.ts` | hand |
| Quick-add parser | `internal/quickadd` | `web/src/lib/nlp` | `web/src/lib/nlp/quickadd.vectors.json` | `internal/quickadd/vectors_test.go` | `web/src/lib/nlp/vectors.test.ts` | hand |
| Quick-add vocabulary | `internal/quickadd/vocab.go` | `web/src/lib/nlp` | `internal/quickadd/vocab.json` | `internal/quickadd/vocab.go` (embedded) | `web/src/lib/nlp/vocab.test.ts` | `cd web && npm run nlp:vocab` |
| Importer date vocabulary | `internal/importer/todoistdate.go` | `web/src/lib/nlp` | `internal/importer/nlpvocab.json` | `internal/importer/todoistdate.go` (embedded) | `web/src/lib/nlp/vocabExport.test.ts` | `UPDATE_NLP_VOCAB=1 npx vitest run src/lib/nlp/vocabExport.test.ts` |
| Task origin | `internal/origin` | `web/src/lib/taskOrigin.ts` | `internal/origin/testdata/origin_vectors.json` | `internal/origin/vectors_test.go` | `web/src/lib/taskOrigin.test.ts` | hand |
| Tracked time: the one-running rule | `internal/timetrack` | `web/src/lib/time.ts` | `internal/timetrack/testdata/rule_fixture.json` | `internal/timetrack/rule_test.go` | `web/src/lib/time.test.ts` | hand |
| Tracked time: CSV export | `internal/timetrack` | `web/src/lib/time.ts` | `internal/timetrack/testdata/csv_fixture.json` | `internal/timetrack/csv_test.go` | `web/src/lib/time.test.ts` | `go test ./internal/timetrack -update-csv` |
| Activity events from ops | `internal/activity` | `web/src/lib/activity.ts` | `internal/activity/testdata/activity_fixture.json` | `internal/activity/activity_test.go` | `web/src/lib/activity.test.ts` | `OPENTODO_UPDATE_FIXTURE=1 go test ./internal/activity` |
| Automation rule conditions | `internal/ruleval` | `web/src/lib/rules/match.ts` | `web/src/lib/rules/match.vectors.json` | `internal/ruleval/ruleval_test.go` | `web/src/lib/rules/match.test.ts` | hand |
| Automation rule planner | `internal/rules` | `web/src/lib/rules/plan.ts` | `web/src/lib/rules/plan.fixture.json` | `internal/rules/plan_test.go` | `web/src/lib/rules/plan.test.ts` | hand |
| Weekly digest statistics | `internal/digest/stats.go` | `web/src/lib/stats.ts` | `internal/digest/testdata/stats_fixture.json` | `internal/digest/stats_test.go` | `web/src/lib/stats.test.ts` | hand |
| Available tasks (project flows) | `internal/flow` | `web/src/lib/flow.ts` | `internal/flow/testdata/flow_fixture.json` | `internal/flow/flow_test.go` | `web/src/lib/flow.test.ts` | hand |
| Next action (method views) | `internal/digest` | `web/src/lib/method/rules.ts` | `internal/digest/testdata/next_action_fixture.json` | `internal/digest/nextaction_test.go` | `web/src/lib/method/rules.test.ts` | hand |
| On-device assistant tools | `internal/assistant` | `web/src/lib/assistantDevice` | `web/src/lib/assistantDevice/manifest.json` | `internal/assistant/manifest_test.go` | `web/src/lib/assistantDevice/manifest.ts` | `go test ./internal/assistant -run Device -update` |
| On-device assistant planners | `internal/assistant`, `internal/agenttools` | `web/src/lib/assistantDevice/plan.ts` | `web/src/lib/assistantDevice/plan.vectors.json` | `internal/assistant/manifest_test.go` | `web/src/lib/assistantDevice/tools.test.ts` | `go test ./internal/assistant -run Device -update` |
| On-device assistant prompt | `internal/assistant` | `web/src/lib/assistantDevice/prompt.ts` | `web/src/lib/assistantDevice/prompt.vectors.json` | `internal/assistant/manifest_test.go` | `web/src/lib/assistantDevice/loop.test.ts` | `go test ./internal/assistant -run Device -update` |
| Provider error reading (Chat Completions) | `internal/assistant` (`chatError`) | `web/src/lib/assistantDevice/providers.ts` (`statusError`) | `web/src/lib/assistantDevice/errors.vectors.json` | `internal/assistant/errors_test.go` | `web/src/lib/assistantDevice/providers.test.ts` | `go test ./internal/assistant -run Device -update` |

Thin vector sets give false confidence: when you change one of these modules, add the case you fixed or added to its fixture first.

Other fixtures are not shared between the two languages: the agent tool lists (`internal/agenttools/testdata/*.golden.json`, also read by the Claude plugin check), the MCP tool list, the CLI schema, the importers' golden outputs, `web/src/lib/habits.vectors.json` and `web/src/lib/briefing.fixtures.json`.
