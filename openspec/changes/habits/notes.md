# Implementation notes

## Status (2026-10-15)

Done on `feat/habits`: 1.1–1.4 (fields, client type and defaults, activity fixture, docs), 2.1–2.4 (habit skip records, skip-aware counts on both sides, `habit` in assistant task output, recurrence docs), 3.1 (`lib/habits.ts` with vectors), 3.4 (the Habits section of `docs/recurrence.md`), 4.3 (`habit` filter keyword, `completed` without skip records, also accepted by the server's filter parser) and the filter rows of 4.4.

Held until the ux-overhaul PRs (through its group 4) merge: 3.2 (icons in the design system), 3.3 (`HabitHistory`), 4.1–4.2 (the switch, the streak chip), the Completed view filter, the rest of 4.4, the smoke test and `make check`.

## Decisions taken while implementing

- `monthGrid` takes an optional `weekStart` and pads the first row with cells whose date is ''; days of the month the habit is not scheduled on have state `blank`.
- The tasks.md test for 4.1 ("Track as a habit" only on calendar rules) is mirrored in `habitStats`, which returns zeros for completion-relative rules.
