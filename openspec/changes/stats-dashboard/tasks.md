# Tasks

## 1. Periods and the one-pass model (design D3, D8)

- [x] 1.1 Replace the period kinds in `web/src/lib/stats.ts` with this week, this month, this quarter, this year and last week, with `comparisonOf(period)` (same number of days from the start of the previous unit; the full previous week for last week). Verify with new `stats.test.ts` cases for "Sunday start", "Month to date", "Week end at the day start", quarter and year boundaries, and a 10 October comparison window of 1–10 September; run `npm test -- stats` in web/.
- [x] 1.2 Build one pass over the counted tasks and own time entries for the 53-week window into per-day and per-day-and-hour buckets (logical day, local hour), and derive every period measure by slicing them. Verify that the existing `stats.test.ts` and `statsTime.test.tsx` expectations still hold, and that a 20,000-task fixture computes in under 50 ms in a vitest benchmark-style test; run `npm test -- stats statsTime`.
- [x] 1.3 Fall back to this week for a stored `ot.stats.period` value that no longer exists. Verify with a test that sets `4-weeks` in localStorage and expects "This week" checked; run `npm test -- statsView`.

## 2. Measures (design D4, D5)

- [x] 2.1 Add on time, streak (current and best in 53 weeks) and tracked against estimate (each task once, count of tracked tasks without an estimate) to `compute`. Verify with the spec scenarios "On time", "Streak across the day start", "Tracked without estimates" and "No due dates" as unit tests; run `npm test -- stats`.
- [x] 2.2 Add estimate accuracy: median tracked ÷ estimate over tasks with an estimate and at least 5 own tracked minutes, and the top three projects or labels (at least three tasks each) furthest from 1. Verify with tests for the median, the grouping threshold and "Estimates need enough tasks"; run `npm test -- stats`.
- [x] 2.3 Add "keeps slipping" from the local `activity` table: open live tasks with three or more `rescheduled` events in 90 days that moved the due date later or removed it. Verify with a fake-indexeddb test that seeds activity rows (later, earlier, removed, older than 90 days) and expects only the qualifying task; run `npm test -- statsSlipping`.
- [x] 2.4 Check that shared-project and trash rules apply to every new measure. Verify with a test that a task completed by another member and a trashed task count in no measure; run `npm test -- stats`.

## 3. Chart components and tokens (design D1, D2, D6)

- [x] 3.1 Add `--color-chart-seq-1..5` for light and dark to `web/src/index.css` for every built-in accent, and a unit test that runs the dataviz palette checks (contrast against the chart surface, monotonic lightness) for each accent, falling back to the neutral ramp where it fails. Verify with `npm test -- chartTokens` and `make ui-lint`.
- [x] 3.2 Build `StatTile` (value, comparison in words and an `<Icon>` arrow in text tokens, "–" with a reason), `LineChart` (two series, solid and dashed, direct end labels, hover and focus tooltip), `HBars`, `Heatmap` (53 weeks, five shades, sideways scroll on phones with the current week in view) and `DotGrid` (7 × 24, dot area by count) in `web/src/app/review/`. Each is a figure with a summary, a "Show as table" control and one roving-tabindex grid, and the table is shown under forced colours. Verify with stories for each (light and dark, empty, dense) in the workbench, `make ui-check` passing with new baselines, and interaction tests for arrow-key movement and the tooltip text (`// @vitest-environment happy-dom`); run `npm test -- charts`.
- [x] 3.3 Measure the review chunk before and after with `npm run build` in web/. Verify that the growth is under 12 KB gzipped and record the number in this change's design.md.

## 4. The dashboard screen (design D7)

- [x] 4.1 Rebuild `StatsView.tsx`:
  - page header with the title, the period chooser as the second row and the menu
  - tiles, then the panels in question order, two columns from 1024 px and one below
  - empty panels collapsed to one line
  - the "computed on this device" line
  - the "keeps slipping" note "based on this device's history"

  Verify with `budget.test.tsx` (no chrome between header and first panel, one vertical scroller), a test for the "Phone" scenario at 390 px, and the keyboard scenario; run `npm test -- statsView budget`.
- [x] 4.2 Keep "Export time entries" in the header menu after the period chooser. Verify that the existing export test still passes; run `npm test -- timeExport`.
- [x] 4.3 Add every new string to the catalogs and translate them (de, fr, es, it, pt). Verify with `node scripts/i18n/extract.mjs --write` and `node scripts/i18n-check.mjs`.
- [x] 4.4 Update `docs/statistics.md` (the periods and comparison, each panel and its question, on time and streak definitions, estimates, keeps slipping being per device, the table views) and regenerate its screenshots with `make docs-screenshots` (add a "stats" scene). Verify with `make docs-check`.

## 5. Integration

- [x] 5.1 Run the layout check on `/stats` at 360, 390 and 768 px in light and dark (`ONLY=stats make layout-check` or the CI job). Verify that there is no sideways page scroll and no target under 44 px outside the chart grids, whose marks keep 24 px hit targets.
- [x] 5.2 Manual smoke on `make dev` with the demo data:
  - switch through the five periods
  - tab into each chart and move with the arrows
  - open "Show as table"
  - check light, dark and a 390 px window
  - confirm the network panel shows no request

  Record the result in this change's design.md.
- [ ] 5.3 Archive only after `time-tracking` is archived (this change removes "Breakdowns and charts", which time-tracking modifies). Run `make check` and add the CHANGELOG.md entry under Unreleased.
