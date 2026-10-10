# Tasks

## 1. Data model: `estimate_minutes`

- [x] 1.1 Add `estimate_minutes` (nullable positive integer kind) to `Schema` in `internal/sync/ops.go` with validation; verify `TestValidateRejectsBadOps` gains cases for 0, -5, 1.5, "30" and `go test ./...` passes
- [x] 1.2 Add the field to `Task`/`TASK_FIELDS` in `web/src/lib/types.ts` and `TASK_DEFAULTS` in `web/src/lib/ops.ts`; verify `ops.test.ts` round-trips an op for the field and `npm test` passes
- [x] 1.3 Confirm REST create/patch accept the field and export includes it; verify a new case in `TestRestWriteThroughAndSyncRoundTrip` patches `estimate_minutes` and reads it back (`go test ./...`)
- [x] 1.4 Update `docs/api.md` and `docs/sync.md` field tables; verify the tables list `estimate_minutes` with its type

## 2. Parser module (client)

- [ ] 2.1 `web/src/lib/nlp/tokenize.ts`: quote-aware tokenizer with character spans; verify `nlp.test.ts` cases for quotes and whitespace collapsing (`npm test`)
- [ ] 2.2 `web/src/lib/nlp/attributes.ts`: `#project` (exact then unique prefix, skips archived/deleted), `@label`, `p1`–`p4`, `+duration`; verify tests for the full-line, unknown-project and ambiguous-prefix scenarios
- [ ] 2.3 `web/src/lib/nlp/vocab/{en,de,fr,it,es,pt}.ts`: day words, weekdays, months, qualifiers, units; verify a test asserts every vocabulary defines the same keys
- [ ] 2.4 `web/src/lib/nlp/dates.ts`: phrase grammar and resolver (bare weekday, next, in N, next week/month, month-day, numeric, times 12h/24h, "at", day/month order); verify table-driven tests with fixed reference dates, including "next Wed at 3pm", "16:30" alone, "3 Feb" rolling forward, and German/French/Italian/Spanish/Portuguese phrases
- [ ] 2.5 `web/src/lib/nlp/parse.ts`: `parse(line, {today, now, languages, projects, dismissed})` returning title, attributes and spans; verify determinism test (same input twice, and with shuffled project list, yields deep-equal output) and that dismissed spans are skipped

## 3. Quick add UI

- [ ] 3.1 `QuickAdd.tsx`: run the parser on every change, render chips (`role="status"`, `aria-live="polite"`) with dismiss buttons, title preview; verify in the browser that typing `Buy milk tomorrow p2` shows two chips and the preview `Buy milk`
- [ ] 3.2 Backspace-at-end highlight-then-dismiss, chip dismissal persistence per span, quoted text protection; verify browser flow for `Review may report` dismissal and `"may"` quoting, plus unit tests for span bookkeeping (`npm test`)
- [ ] 3.3 Submit path: merge parsed attributes over view defaults and call `createTask` with `due`, `project_id`, `labels`, `priority`, `estimate_minutes`; clear input and chips, keep focus; verify in Today view `Plan trip next Monday #travel` lands in Travel next Monday and the input stays focused
- [ ] 3.4 `TaskRow.tsx`: show `estimate_minutes` as a muted `45m` chip; verify in the browser after creating `Write report +45m`
- [ ] 3.5 Settings: parsing on/off switch, active languages, day/month order (per device, local storage); verify that with parsing off `Buy milk tomorrow p2` creates a task with that literal title and priority 4
- [ ] 3.6 Offline check: create `Water plants tomorrow #home` with the network off, reconnect; verify the task reaches a second device with the parsed date and project (browser flow), and `npm run build` passes

## 4. Docs and release

- [ ] 4.1 Write `docs/quick-add.md` (syntax reference, resolution rules, languages, escaping) and link it from README and the `?` shortcut help; verify links resolve
- [ ] 4.2 CHANGELOG entry under Unreleased noting the additive field and "update the server before clients"; verify `make check` passes including `openspec validate --all --strict`
