# A dashed range is not a date

## Why

On a shared grocery list, "3-4 tomatoes" became a task titled "tomatoes" due 4 March, and "4-5 scoops of pinto beans" one due 5 April. Quick add reads a dashed day and month without a year as a numeric date, so every quantity range on a shopping list turns into a due date. Where dates are written month first, people write them with a slash (`3/4`), not a dash. In day-first languages a dash is a common date form (Dutch `3-3`) and stays one.

## What Changes

- Month first, a dashed day and month without a year (`3-4`) is not a date and stays in the title. `3/4`, `3-4-2027` and ISO dates are unchanged.
- Day first (the day-month date format, or a day-first language), nothing changes: `3-4` is 3 April.
- The TypeScript parser and the Go port change together, with shared vectors for each case.

No new setting, op field, route or dependency. Not **BREAKING**: a line that relied on `3-4` as a month-first date now keeps it as text; `3/4` gives the date.

## Out of scope

- Slashed fractions (`1/2 cup`) and a per-project switch to stop reading dates.

ROADMAP.md: none (a fix to `natural-language-capture`).

## Capabilities

### Modified Capabilities

- `natural-language-capture`: "Numeric dates follow the date format" says a dashed date without a year is month-first text.

## Impact

- `web/src/lib/nlp/dates.ts`, `internal/quickadd/dates.go`, `web/src/lib/nlp/quickadd.vectors.json`; `docs/quick-add.md`; `changelog.d/Fixed/dash-ranges.md`.
