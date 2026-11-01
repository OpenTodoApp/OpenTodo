# Tasks

## 1. Entity and shared step model

- [x] 1.1 `internal/sync/ops.go`: `rule.steps` (kind `kRoutineSteps`, default `null`, documented), the `manual` trigger kind; the sync shape check (known kinds, unique ids, visible references, at most 20 steps and 3 block levels, 32 KB); regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; verify `go test ./internal/sync/...` (valid steps apply, a reference to a later step and a 21st step are refused, an older value of `steps` loses by LWW)
- [x] 1.2 `internal/ruleval/steps.go`: the step table (groups, inputs, output types, content flags), the type checker with the three coercions and implicit for-each, the D2 reading of `actions`/`steps`; `web/src/lib/rules/steps.ts` the same; shared vectors `web/src/lib/rules/steps.vectors.json` (types, errors, the D2 reading); verify `go test ./internal/ruleval/...` and `npm test`
- [x] 1.3 Data steps as pure functions in Go and TypeScript (note text cut at 64 KB, split lines, join, format, replace, filter, sort, take, count, if, repeat, stop, date) with vectors; verify `go test ./internal/ruleval/...` and `npm test` give the same outputs
- [x] 1.4 `ruleval.Available`: availability with reason and setting for every row of design D15; verify table tests in `go test ./internal/ruleval/...` (email without SMTP, unverified address, encrypted, no webhook, energy off, focus off, demo, automations off; notify stays available without channels)
- [x] 1.5 Web: `Rule.steps` in `web/src/lib/types.ts`; the existing Rules page lists a multi-step routine as "Made with a newer version" until `routines-editor`; verify `npm test` (`rules.test.tsx`)

## 2. Engine

- [x] 2.1 `internal/rules`: plan-then-write runner over steps (overlay of planned changes, ids at planning, one batch per entity through `ApplyStrict` with device `rule:<rule-id>`, `NotifyApplied`, partial counts); a failing step writes nothing; verify `go test ./internal/rules/...` ("Failure at step 4", "Later steps see earlier changes")
- [x] 2.2 The routine caller in `internal/agenttools` (`Scope: routine`, no token gate, no per-token limits, no `agent.write` audit) and the tool-backed steps planned through it; a test that every `tool`-backed step names a registry tool and every registry write tool is a step or listed with a reason; verify `go test ./internal/agenttools/... ./internal/rules/...`
- [ ] 2.3 Steps backed by other services: quick add (`internal/quickadd`) for Create tasks, `internal/timetrack` for timer and tracked time, the Go port of `focusEdit.ts` rules with shared vectors for Set today's focus, the embedded template library for Create a project from a template (the library's instantiation test also runs the Go reader), Append and Clear note writing the projection like a REST write; verify `go test ./internal/...` and `npm test` (focus vectors, template counts and dates equal), and a two-device test that a cleared note is not brought back by an older copy
- [ ] 2.4 `internal/filter`: an evaluator for Find tasks with a query or view, evaluation vectors shared with `web/src/lib/filter`; verify `go test ./internal/filter/...` and `npm test`
- [ ] 2.5 Communication steps: Notify me (in-app kind and the `routine` channel event, only with `notifications.channels`), Send a webhook (`rule.fired` with `routine`), Email me (`internal/mail` kind `routine`, to the verified address only, 10 per routine and 20 per account per day); verify `go test ./internal/notify/... ./internal/channels/... ./internal/webhook/... ./internal/mail/...` (an `smtptest` message for Email me, nothing sent for an encrypted account or past the limit)
- [x] 2.6 Limits of design D6 (time limit through a context deadline, 500 writes, list and text bounds, 500 iterations) and unchanged rates, runaway pause, 50 routines; a run counts once; verify `go test ./internal/rules/...` with a stepped clock
- [x] 2.7 Unavailable steps at run time fail the run at that step with the reason, nothing written; verify `go test ./internal/rules/...` ("SMTP removed later", "Webhook deleted", "Energy switch off")
- [x] 2.8 Encrypted accounts: content-free routines run, content routines are skipped `encrypted`; verify `go test ./internal/rules/...`
- [x] 2.9 Migration `NNNN_routines.sql` (the next free number): `rule_runs` columns and `rule_step_runs`; run and step records with ids and counts only; retention 100 per routine for 30 days, failed 90 days; verify `go test ./internal/store/... ./internal/rules/...` (old rows read with defaults; no text column is written)
- [x] 2.10 Undo a run (design D12), marked as an undo that produces no rule events; verify `go test ./internal/rules/...` ("Undo a sweep", "Created tasks", "Twice")

## 3. Routes, CLI, MCP

- [x] 3.1 `internal/httpapi/rules.go`: `POST /api/v1/rules/test`, `POST /api/v1/rules/{id}/run`, `GET /api/v1/rules/{id}/runs/{run}`, `POST /api/v1/rules/{id}/runs/{run}/undo`, `GET /api/v1/me/rules/runs`, `GET /api/v1/me/rules/catalogue`, each through `routes.handle` with `signedIn.DemoDenied()`; `steps` in every representation; warnings for unavailable steps; verify `go test ./internal/httpapi/...` (201/200, 401 without credentials, 403 `insufficient_scope` for `read` and `agent` tokens on writes, 400 `task_required`, 409 `already_undone`, 429 `rate_limited`, 404 for another user's run, 403 `demo_restricted` on a demo, `policy_test.go` and the demo deny list test)
- [ ] 3.2 Export and own-format import re-map ids inside `steps`; verify `go test ./internal/httpapi/... ./internal/importer/...` (round trip of a three-step routine)
- [ ] 3.3 `internal/cli`: `ot routine list|show|runs|run [--task] [--test]|enable|disable|create --file|edit --file|rm|undo`, alias `ot routines`, `ot rules` kept; names resolved before sending; JSON and YAML (`go.yaml.in/yaml/v3`, a test keeps it out of the server binary); `ot schema` entries; exit codes 5 and 6; `docs/cli.md`; verify `go test ./internal/cli/...`
- [ ] 3.4 MCP read tools `list_routines`, `get_routine`, `list_routine_runs`, `get_routine_run`, resources `opentodo://routines` and `opentodo://routines/{id}`, untrusted marking, `e2ee.Display`; verify `go test ./internal/agenttools/... ./internal/mcp/...`
- [ ] 3.5 MCP write tools `run_routine`, `set_routine_enabled`, `create_routine`, `update_routine`, `trash_routine` behind the write gate, same validation and availability warnings, write limits, `agent.write` audit, device `agent:<token-id>` for definitions and `rule:<rule-id>` for runs; ciphertext-only names on encrypted accounts; verify `go test ./internal/agenttools/... ./internal/mcp/...` (gate closed, invalid steps, create then test)
- [ ] 3.6 Palette: "Run routine…" and "Go to Routines" with the open task passed, toast with View run and Undo, offline "Needs a connection"; verify `palette.test.tsx` and `registry.test.tsx` with `npm test`
- [ ] 3.7 Host mode: a routine within the tenant's limits, `tenant_limit` failure; verify `go test ./internal/host/...`

## 4. Docs and checks

- [ ] 4.1 `docs/automations.md` (routines, the catalogue, availability, limits, runs, undo, what is not offered and why), `docs/api.md`, `docs/cli.md`, `docs/mcp.md`, `docs/sync.md` (`rule.steps`); verify `make docs-check`
- [ ] 4.2 CHANGELOG Unreleased entry (at archive)
- [ ] 4.3 `go test ./...`, `npm test`, `npm run build`, `make check`, `make openspec-validate`
