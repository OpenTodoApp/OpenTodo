# Tasks

## 1. Vocabulary and shared files (design D2, D5)

- [x] 1.1 Extend `web/src/lib/nlp/vocab/types.ts` with the recurrence and reminder blocks (`every`, `everyOne`, `weekdayAll`, `ordinals`, `lastWords`, `afterCompletion`, `untilWords`, `timesWords`, `andWords`, `remind`, `beforeWords`, `afterWords`) and a `minute` unit, and fill them in `en.ts`, `de.ts`, `fr.ts`, `it.ts`, `es.ts`, `pt.ts`. Verify with `npm run typecheck` in web/ and a vitest asserting every vocabulary has every new list non-empty.
- [x] 1.2 Add `web/scripts/nlp-vocab.mjs` and the `nlp:vocab` npm script that serialise the vocabularies to `internal/quickadd/vocab.json`, plus `nlp/vocab.test.ts` that fails when the file is stale with a message naming the script. Verify by editing a word, seeing the test fail, regenerating and seeing `npm test` pass.
- [x] 1.3 Create `web/src/lib/nlp/quickadd.vectors.json` with a case for every scenario in the three spec deltas (each language named, plus the negative cases `every client`, `remind Bob`, `every 3 hours`, the quoted phrase and the second-rule case) and wire it into `nlp.test.ts`. Verify with `npm test` in web/ (the new cases fail until 2.x lands; mark them `todo` until then or land 1.3 with 2.3).

## 2. Web parser (design D1, D3, D4)

- [x] 2.1 Implement `nlp/recurrence.ts` `matchRecurrenceAt`: every-word + interval, weekday list with Romance plurals, collective weekday word, ordinal with optional weekday, last day/weekday, one-word forms, `after completion`, `until <date phrase>` (via `matchDateAt`), `for N times`; build the English rule and accept only what `parseRule` accepts. Verify with unit tests for each pattern in English and German and the vector cases (`npm test`).
- [x] 2.2 Implement `nlp/reminders.ts` `matchReminderAt`: reminder word, then an offset (count + unit or `matchDuration`, before/after word) or a moment (`matchTimeAt` with an optional `matchDateAt` before or after it); return `ReminderPhrase`. Verify with unit tests for `at 9`, `tomorrow at 9`, `20 Oct at 9`, `30 min before`, `1 day before`, `2 hours after`, `+30m before`, and a bare reminder word that must not match.
- [x] 2.3 Wire both into `parse.ts` (longest match with the date and time matchers, first rule wins, reminders accumulate), add `recurrence` and `reminders` to `ParseResult`, the two `AttributeKind`s, and `recurrence`/`reminders` to `QuickAddInput` in `quickadd.ts`. Verify with the full vector file and the existing `nlp.test.ts`, `quickadd.test.ts` and `weekPrefs.test.ts` passing (`npm test`).
- [x] 2.4 Extend `createTask` in `web/src/lib/ops.ts` to resolve `ReminderPhrase[]` against the final due (D3 rules, wall-clock minute arithmetic, absolute roll-forward) and write task and reminders through `mutateMany` in one transaction. Verify with vitest cases for the four resolution scenarios of the spec, a test that an offline capture queues task and reminder ops with the same `ts`, and a test that completing the recurring task carries the reminder to the next occurrence (`npm test`).
- [ ] 2.5 Add the `recurrence` and `reminder` chips to `web/src/app/QuickAdd.tsx` (`chipText`, `KIND_NAME`, `CHIP_HUE`, first-occurrence suffix, "needs a due date" suffix) and the new `QUICK_ADD_SYNTAX` row in `web/src/lib/shortcuts.ts`. Verify with a component test showing the two chips for `Water plants every Monday remind me at 8`, Backspace twice dismissing the reminder chip, and `npm run build` in web/.
- [ ] 2.6 Confirm the section inline add (`Sections.tsx`) and `ShareCapture.tsx` create reminders through the spread input without changes; add one test for the share screen. Verify with `npm test` in web/.
- [x] 2.7 Update `docs/quick-add.md` (a "Repeat and remind" section with the six-language table, the chip behaviour, removal of the "Not understood" sentence), `docs/recurring-and-reminders.md` ("Quick add doesn't read them" paragraph), `docs/reminders.md` (one line on reminders typed in quick add), regenerate the keyboard guide and help bundle with `make docs`. Verify with `npm run docs:check` in web/.

## 3. Go port (design D5)

- [x] 3.1 Create `internal/quickadd` with `tokenize.go`, `vocab.go` (embedding `vocab.json`), `dates.go`, `attributes.go`, `recurrence.go`, `reminders.go`, `parse.go`, exposing `Parse(line string, ctx Context) Result` and `ParseReminder(phrase string, ctx Context) (ReminderPhrase, error)`. Verify with `go vet ./...` and unit tests per grammar (`go test ./internal/quickadd/...`).
- [x] 3.2 Add `vectors_test.go` running `../../web/src/lib/nlp/quickadd.vectors.json` through `Parse` and a `vocab_test.go` asserting the embedded file loads every language. Verify with `go test ./internal/quickadd/...` passing on every vector.

## 4. CLI (design D6, D7)

- [x] 4.1 Add `--repeat` (add and edit, `none` clears on edit) to `taskFlags` in `internal/cli/cmd_tasks.go` with local canonicalisation through `internal/recurrence`, and `--remind` (add, repeatable) resolved with `ParseReminder` against the final due; send one `POST /reminders` per reminder after the task, with `K.r<n>` idempotency keys and the placeholder task id in dry runs. Verify with harness tests for the spec scenarios (rule and two reminders, invalid rule exit 2, clear the rule, reminder without a due, idempotent retry, failed reminder request names the task id) in `cli_test.go` (`go test ./internal/cli/...`).
- [x] 4.2 Add `--natural` and `--lang` to `ot add`: parse with `internal/quickadd` using `a.Now()`, locale-derived languages, language numeric order and Monday week start; explicit flags win. Verify with harness tests for the three `--natural` scenarios of the spec and the unknown-project case (`go test ./internal/cli/...`).
- [x] 4.3 Update the command table, regenerate `testdata/schema.golden.json` (`go test ./internal/cli -run TestSchemaGolden -update`), and add the flags to `SKILL.md` with the "prefer `--repeat`/`--remind` over `--natural`" advice. Verify with `go test ./internal/cli/...` (schema, help-and-schema-agree and skill tests) and `make skill`.
- [x] 4.4 Document the flags, the `--natural` grammar, `--lang` and the two stated differences from the web parser (Monday week start, language numeric order) in `docs/cli.md`. Verify with `npm run docs:check` in web/ and by running the documented commands in `make cli-smoke`.

## 5. Integration

- [ ] 5.1 Manual smoke on `make dev`: type `Water plants every Monday remind me at 8 #home` and `Zahnarzt morgen um 15 Uhr erinnere mich 30 Minuten vorher` (German active), check chips, dismissal, the created task's Repeat field and Reminders list; go offline, capture a line with a reminder, reload, reconnect and confirm both synced to a second browser profile; run `ot add --natural` and `ot add --repeat … --remind …` against the same server. Record the result in the change folder notes.
- [ ] 5.2 Run `make check` (go test, web test and build, docs check, openspec validate). Verify it passes.

## Workflow follow-up

- Close GitHub issue pixari/opentodo#6 with a link to the release.
- Add a CHANGELOG.md entry under Unreleased ("Quick add understands repeat rules and reminders in six languages; `ot add --natural`, `--repeat`, `--remind`").
- Tell the `named-importers` change that `internal/quickadd/vocab.json` exists (design D7 there can read it).
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
