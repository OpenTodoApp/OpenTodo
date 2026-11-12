# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Habit numbers are computed from scheduled dates** (`habits` "Streak derived from the schedule and the records", `habits-home` D4); a date without a record before the current occurrence is a miss. A target habit has no scheduled dates in that sense.
- **Sync is last-writer-wins per field** (`docs/sync.md`). A single `amount` field on the record would lose one of two concurrent offline additions.
- **Name-based ids** let two devices create the same row offline and converge (`internal/ids.NameID`, used by `daily-notes`).
- **Records already exist per day** with a derived id, and the server port of the calculation lands in `habits-assistant`.

## Goals / Non-Goals

**Goals:**
- Exact convergence for amounts, with no lost addition.
- The same numbers on devices and the server, pinned by the shared vectors.

**Non-Goals:**
- Reusing a calendar rule to express targets ("every week" with a count).
- Amounts for target habits in this change (a target habit counts check-ins, an amount habit counts per day; both on one habit is a later question).

## Decisions

### D1. A target habit is a daily series with a period target

`habit_target` and `habit_period` sit on the task; the rule is `every day`, so the series and its records work unchanged and the device moves it every day. The calculation groups scheduled dates into periods (the user's week start, or calendar months, in the logical today): a period is met with `target` done or tiny records; days are never missed. Resting after the target is met is computed, not written: the strip and the screen hide a habit whose current period is met. Strength runs the `habits-home` D4 average over periods with `v = min(count / target, 1)` and the period frequency in `a`.

- **Alternative: a new rule grammar ("3 times a week").** Rejected: every rule reader (CalDAV, calendar projections, `internal/recurrence`, 1.0's frozen grammar) would need it, for a concept only habits use.
- **Alternative: pick the days automatically.** Rejected: it would show misses for days the user never chose.

### D2. Amounts are summed per-device tallies

A new entity `habit_tally` (`record_id`, `device`, `count`) with the id `NameID(record_id + ":" + device)`. Each device writes only its own row, so concurrent additions never collide; the day's amount is the sum of live tallies. Reaching the amount writes the completion batch (the record's `completed_at`); falling below reopens it. The scope of a tally follows its record's task (shared project members see it; it is exported, trashed and purged with the task), wired like `section` in `internal/sync/scope.go`. The count is not content, so the server can sum it on encrypted accounts.

- **Alternative: `amount` on the record, last writer wins.** Rejected: two offline phones adding water lose a glass, which the spec rules out.
- **Alternative: one op per addition, summed from the op log.** Rejected: devices don't keep the op log (`habits` design Context), and compaction would drop history.
- **Alternative: a per-device field on the record.** Rejected: fields are declared statically in `Schema`; devices are dynamic.

### D3. Partial days count as tiny

A day with a positive amount below the goal counts as kept, like the tiny version, keeping the measure forgiving; the thread shows the share. A completion is written only when the amount is reached, so Completed and the `completed` filter list full days only.

### D4. Tools and routes

`log_habit` and the log route gain `amount` (added to the calling client's tally; MCP and REST clients use their token id as the device) and `set_amount`. Answers report the summed amount. The port in `internal/habits` gains periods and tallies with new vectors (a met week, a missed week, at risk on Sunday, two devices adding, a set amount).

### D5. Screen

The form adds two How often choices and an Amount section; the thread's target bar and amount fills are new states of `Thread.tsx`, with stories in every theme. No new chrome: the row keeps its five properties, the measure text changes.

## Data model impact

Additive: `task.habit_target` (positive int or 0), `task.habit_period` (string), `task.habit_amount` and `task.habit_step` (number), `task.habit_unit` (string, content); a new entity `habit_tally` (`record_id`, `device`, `count`), with scope, export, trash and purge wiring. Regenerated schema files and the v1 surface snapshot. No rename.

## Size and memory

No dependency. Under 1 KB gzip on the first load; one Dexie table for tallies (indexed by `record_id`), read with the records the grid already loads.

## Risks / Trade-offs

- **[A new entity needs scope, export and purge wiring]** → Wired like `section`, covered by the existing scope and export tests extended to tallies.
- **[Many devices make many tallies]** → One row per device per day an amount habit was touched: tens per month for a heavy user.
- **[Week start differs between users of a shared project]** → Periods use the viewing user's week start; numbers in a shared project can differ between members, stated in the docs.

## Migration Plan

None. Habits without a target or an amount behave exactly as before.
