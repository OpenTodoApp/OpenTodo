## Context

1.0.0's web client (`web/src/lib/ops.ts`, `completeTask`) completes a task whose rule it cannot parse as a plain task: `seriesRule()` returns null and `completePlain` sets `completed_at`, so the series ends. `every N weeks on <weekdays>` is new in 1.1, and #1019 wrote it even where 1.0's `every N weeks` gives the same dates.

## Decisions

### D1. Normalise at write time, against the due date
`every N weeks on <day>` and `every N weeks` anchored on a due date on `<day>` give the same dates: the first is every Nth Monday-to-Sunday week from the due date's week, on `<day>`; the second is the due date plus multiples of 7N days. Catch-up agrees too (both keep the phase from the due date). So a writer that knows the task's due date stores `every N weeks` when the rule has one weekday and the due date falls on it. The due date is the one the write leaves the task with: the one in the same write, else the task's, else the first occurrence the writer computes for an undated task. The `until` and `for N times` ends are kept. Nothing else is rewritten.

### D2. One function per language, pinned by vectors
`recurrence.Compatible(rule, due)` / `Rule.Compatible(due)` in Go and `compatibleRule(rule, due)` in TypeScript, checked against the `compatible` vectors of `web/src/lib/recurrence.vectors.json`. `FromRRULE` applies it, so CalDAV, the importer's RRULE reading and the vault's note RRULEs get it in one place. Quick add applies it once the due date is known; the importer in the planner, where the row's due date is final; REST in `canonicalizeRecurrence`; the agent tools after planning the due; the web app in `planTask` and `setRecurrence`; a series split for the piece's rule and first date.

### D3. A frozen 1.0 grammar as the oracle
`internal/recurrence/recurrence10/grammar.go` and `web/src/lib/testdata/recurrence-1.0.ts` are the 1.0.0 parsers, copied and never changed. `Check` / `check10` fail a stored rule that 1.0 cannot read when a rule 1.0 reads (`every N weeks`, `every 7N days`, `every <weekdays>` with the same end) gives the same dates over 60 on-time completions. The writers' tests and every quick-add vector run through it. The Go package is test-only (a test keeps it out of both binaries); the TypeScript file is imported only by tests.

### D4. What remains is documented, not repaired
A rule with several weekdays, or one weekday off the due date, has no 1.0 equivalent. On a 1.0 device it shows as text and completing it ends the series. Detecting and offering to resume such a series on a newer device would need the completion's device version, which the op does not carry; a guess from `completed_at` plus an unparseable-to-1.0 rule would also catch series ended on purpose. `docs/stability.md` lists it under what may change within 1.x, with the advice to update the devices.

## Risks / Trade-offs

- A rule stored as `every 2 weeks` follows its due date when the due date is moved later, where `every 2 weeks on saturday` would come back to Saturday. That is 1.0's behaviour for the same rule and what the task shows.
- Data model: none. No op, field or schema change; no dependency; no bundle-size change beyond a few lines.
- Screens: the repeat field shows the stored rule after it is entered, as it already did; no new control, label or shortcut, so the interface budget of docs/interface-guide.md is unchanged.
