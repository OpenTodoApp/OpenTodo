# Design

## Context

Tasks have a floating `due` and a `completed_at` tombstone-style field; completion is one op. Recurrence must fit the field-level LWW op log: there is no transaction spanning devices, no server-side authority over who completed first, and no way to "merge" two completions after the fact. The design therefore makes every recurrence outcome a pure function of inputs that all devices share (series id, rule, current due, occurrence date), so concurrent actions produce identical ops and LWW is only ever choosing between identical values or between genuinely different user intents.

## Goals / Non-Goals

**Goals:**
- Rules people can type and read; one grammar shared by server validation, REST and client.
- Completion, skip and detach that are safe offline and converge without a coordinator.
- No projection of future occurrences into storage: the series is one task.

**Non-Goals:**
- Full iCalendar RRULE coverage (hourly rules, by-set-position lists, exceptions). `caldav` will map a subset.
- Time-zone aware recurrence (`absolute-datetimes` adds `tz` to `due`; the calculator already works on wall-clock dates so it composes).
- Natural-language entry of rules in quick add (`nlp-quick-add` will call the same parser).

## Decisions

### D1. Rolling task, not pre-generated occurrences
Chosen: a recurring task is one task row whose `due` rolls forward on completion or skip. Completed occurrences are separate task rows (the "occurrence record") with `completed_at` set, `recurrence = null` and `series_id = <series id>`.
- Why: it keeps Today/Upcoming trivially correct (one row per series), needs no background generation job on any device, and a deleted series is a single tombstone. Occurrence records give Completed a true history and make the `for N times` count derivable (count records with that `series_id`).
- Alternatives: pre-generating the next K occurrences (duplicates on every device, hard to cancel); a `completed_occurrences` array on the series (wholesale replacement loses concurrent completions).

### D2. Deterministic occurrence ids
The occurrence record id is a UUID v5-style name-based id: `hash(series_id + ":" + occurrence_date)` formatted as a UUID. Devices completing the same occurrence offline create the same entity with the same field values; the server's `INSERT OR IGNORE` on op ids does not help here (op ids differ) but LWW on identical values does: whichever wins, the row is the same. Detached copies use `hash(series_id + ":detach:" + occurrence_date)` so a detach and a completion of the same occurrence do not collide.
- Why: convergence without coordination. This is the only place the id generator is not random; `internal/ids` and the client get a `nameID(ns, name)` helper (SHA-256 truncated, no dependency).

### D3. Next-occurrence computation
Pure functions `next(rule, due, today)` and `nextAfterCompletion(rule, completedOn)` operating on calendar dates (`YYYY-MM-DD`), weekday arithmetic done without `Date`/`time` zone conversion (proleptic Gregorian day numbers). Calendar rules: first match strictly after `due`; if that is before `today`, first match after `today` (catch-up). Month patterns clamp to the month's last day. Completion-relative rules anchor on the completing device's local date.
- Two devices completing the same calendar occurrence compute identical next dates because the inputs are identical; `today` only matters when overdue, where a one-day divergence between devices near midnight is resolved by LWW and is harmless.
- Both implementations are checked against `openspec/../docs/recurrence-vectors.json` (location: `web/src/lib/recurrence.vectors.json`, read by the Go test via a relative path), with 60+ vectors covering month ends, leap days, ordinals and last-weekday.

### D4. Grammar and canonical form
`every <pattern> [after completion] [until YYYY-MM-DD | for N times]`, case-insensitive, whitespace-normalised, stored canonical lowercase. Patterns: `day`, `N days`, `week`, `N weeks`, `weekday`, `month`, `N months`, `year`, `N years`, weekday names with optional comma or "and" lists and three-letter abbreviations, `Nth` (1st–31st), `last day`, `last weekday`, `<ordinal> <weekday>` with ordinals first/1st..4th/last. `after completion` is accepted on `day(s)`, `week(s)`, `month(s)`, `year(s)` patterns only. Max 200 characters. Validation kind `kRecurrence` in `ops.go` runs the Go parser; REST `PATCH` reuses it.
- Alternative: store structured JSON (`{freq, interval, byDay…}`). Rejected: the human-readable string is what users type and see, round-trips through export and the API without a UI, and the parser is needed anyway for entry. Canonicalisation keeps equality stable.

### D5. Completion flow (client data layer)
`completeTask(id)` for a task with a rule, in one `mutate` batch (same HLC timestamp):
1. Create the occurrence record (D2) with copied fields, `completed_at = now`, `series_id`, `recurrence = null`.
2. Compute the next due; if beyond `until` or the record count reaches `for N`, set `completed_at` on the series instead.
3. Otherwise set the series `due` to the next occurrence (time preserved).
Skip is step 3 only. Detach creates the copy with `completed_at = null` and performs step 3. REST completion via `PATCH {completed_at}` on a recurring task runs the same flow server-side so API clients get identical behaviour; documented in `docs/api.md`.

### D6. Reopen semantics
Reopening an occurrence record clears its `completed_at` and leaves `series_id`; it is now a standalone open task. The series is not rolled back because another device may already have completed later occurrences. Reopening the series itself (only possible after its end condition) clears `completed_at` and leaves the rule, so the next completion continues the series.

### D7. Data model impact
Additive fields on `task`: `recurrence` (string or null, validated), `series_id` (id string or null). No renames. Export and REST include both. Existing clients that have not updated ignore unknown fields in pulled ops (they store them without rendering) and continue to work; they would complete a recurring task as a plain completion, which the series survives (completion is just `completed_at`, and an updated device reopens it when it next completes an occurrence; documented upgrade note).

### D8. Footprint
No dependencies. Parser plus calculator about 4 KB gzipped in the bundle, a few hundred lines of Go; no image or memory impact.

## Risks / Trade-offs

- [Two devices complete an occurrence on different local dates for a completion-relative rule] → Both produce one record (same occurrence date) and LWW picks the later `due`; this matches "latest edit wins" expectations.
- [Mixed old and new clients during rollout] → Old clients validate and store unknown fields unchanged and never emit them; the worst case is a plain completion of a series, recoverable by reopening. Noted in the changelog.
- [Catch-up hides missed occurrences] → By design; a "missed" count can be surfaced later from the gap between due and today without new data.
- [Grammar ambiguity (`every 2nd` of month vs `every 2nd tuesday`)] → Grammar is LL(1) on the token after the ordinal; vectors include both forms.
- [Deterministic ids collide if a series is restarted on the same date] → Name includes the series id, and a completed record for that date already existing is the correct outcome (idempotent).
- [Parser drift between Go and TypeScript] → Shared vector file executed by both test suites in CI (`make check`).

## Migration Plan

Additive schema change only; no data migration. Rollback leaves `recurrence` values in the log, which older builds ignore.

## Open Questions

- Whether `every weekend` and `every N hours` are worth adding before `nlp-quick-add` lands.
- Whether Upcoming should optionally project the next few occurrences as ghost rows (display only, no data).
