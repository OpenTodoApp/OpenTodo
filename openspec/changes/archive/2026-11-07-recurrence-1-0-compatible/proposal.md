## Why

`quick-add-weekday-recurrence` (#1019) made quick add, CalDAV, the importer and the vault store `every 2 weeks on saturday`, even for "every other Saturday" due on a Saturday, where 1.0's `every 2 weeks` means the same thing. A 1.0.0 client cannot parse the new form: it shows the rule as text, and completing the task there takes the plain completion path, so the series ends for good. `docs/stability.md` promises that every 1.x client keeps working against a newer server, including a web app still cached on a phone.

## What Changes

- Every writer of a rule stores the form 1.0 reads when one means the same thing: `every N weeks on <day>` whose due date (at write time) falls on that day is stored as `every N weeks`, which the due date anchors. One function per language does it (`recurrence.Compatible` in Go, `compatibleRule` in TypeScript), pinned by shared vectors: quick add in both parsers, the CalDAV RRULE mapping, the importer, the vault, the agent tools, REST, the repeat field and a series split.
- Several weekdays with N > 1, a due date on another weekday ("today and repeat every other Saturday" on a Wednesday) and no due date keep the new form, the only correct one.
- Tests check every writer's output against a frozen copy of the 1.0.0 grammar: a rule 1.0 cannot read fails when a 1.0 rule gives the same dates.
- `docs/stability.md` says what remains: a rule only 1.1 can express is shown as text on a 1.0 device, and completing it there ends the series; update the devices.

Out of scope: resuming a series a 1.0 device ended (documented instead; detecting it reliably needs more than the completed row), rewriting rules already stored, and normalising when only the due date changes later. Not **BREAKING**: no op, field or environment variable changes. A fix for #1016's follow-up; no ROADMAP.md row.

## Capabilities

### New Capabilities

### Modified Capabilities
- `recurring-tasks`: rules are stored in the form a 1.0 client reads when one means the same thing.
- `natural-language-capture`: "every other <weekday>" due on that weekday is stored as `every 2 weeks`.

## Impact

`internal/recurrence` (`Compatible`, `FromRRULE`; the frozen grammar and the check in `internal/recurrence/recurrence10`, test-only), `internal/quickadd`, `internal/importer` (`plan_foreign.go`, `plan_own.go`), `internal/vault/task.go`, `internal/agenttools`, `internal/httpapi/recurring.go`, `internal/sync/split.go`; `web/src/lib/recurrence.ts`, `web/src/lib/nlp/parse.ts`, `web/src/lib/ops.ts` (`planTask`, `setRecurrence`), `web/src/lib/seriesSplit.ts`, the frozen grammar and check in `web/src/lib/testdata/`. Vectors: `recurrence.vectors.json` (`compatible`), `quickadd.vectors.json`. Docs: `docs/stability.md`, `docs/recurrence.md`, `docs/quick-add.md`, `docs/repeat-rules.md`.
