# Design

## Context

Statistics today (`web/src/app/review/StatsView.tsx`, `web/src/lib/stats.ts`) computes counts, per-day/week/weekday/project completions and, since time-tracking, tracked minutes per day and project. It draws one chart type, `Bars.tsx`: a hand-made SVG with a visually hidden table. The view is already in the lazily loaded review chunk (`Shell.tsx`). Days are the user's logical days (`logicalDay`, day-boundary). The weekly email digest computes the same counts on the server (`internal/digest/stats.go`), pinned by `internal/digest/testdata/stats_fixture.json`.

The data the new panels need is already on the device:

| Panel | Rows read | Notes |
|---|---|---|
| Tiles, keeping up | tasks (`completed_at`, `created_at`, `due`) | as today |
| Streak, heatmap | tasks (`completed_at`), 53 weeks | the heatmap ignores the period |
| When you get things done | tasks (`completed_at`) | hour in the viewer's zone |
| Where time goes, estimates | `timeEntries`, tasks (`estimate_minutes`, labels) | own entries only |
| Keeps slipping | `activity` rows of kind `rescheduled`, open tasks | device-local record, see D5 |

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Every panel answers one question and is readable as text.
- Same numbers on every synced device for every panel except "keeps slipping" (D5).
- First paint of the dashboard under 150 ms for an account with 20,000 tasks on a mid-range laptop; no visible jank on period change.

**Non-Goals:**
- Changing the digest's numbers or the shared stats fixture.
- Interactive drill-down beyond linking a task or opening a filtered list.
- Custom dashboards. Saved views and `rule-boards` already cover that.

## Decisions

### D1. Hand-made SVG on the design tokens, no chart library

The charts are small, few and fixed: a line chart, horizontal bars, a heatmap grid, a dot grid and stat tiles. Hand-drawn SVG takes about 250 lines per form, follows the tokens and themes for free, and stays inside the review chunk.

- **Alternatives:**
  - Chart.js (~70 KB gzipped, canvas, so the a11y layer would be ours anyway)
  - uPlot (~20 KB, time-series only, no heatmap)
  - Recharts (React, ~100 KB)
- **Why not a library:** the project has seven runtime dependencies and "justify every dependency". None of the libraries removes the work that matters most here, the text equivalents and keyboard access.
- **Cost:** the review chunk grows by an estimated 8–12 KB gzipped, with no effect on the main bundle, the image or runtime memory beyond the open page.

### D2. Colour by job, from the existing tokens

- **Default:** every series is one hue, the accent.
- **Two-series line (completed vs created):** completed in the accent, created in the neutral de-emphasis token, with direct labels at the line ends and a 2 px solid vs 2 px dashed stroke, so identity is never colour alone.
- **Heatmap:** a five-step sequential ramp of the accent, from the sunken surface to the full accent. The steps are new tokens `--color-chart-seq-1..5`, defined for light and dark separately and checked with the dataviz palette validator against both surfaces before shipping.
- **Deltas in tiles:** an arrow glyph from `<Icon>` and the words ("+12 % vs last month"). They use text tokens, never status red/green, because a drop in "created" is not bad.
- **Text:** always in text tokens.

### D3. Periods: calendar units compared to date

The periods are **This week, This month, This quarter, This year** (calendar units in the viewer's logical days; the week from the first-day-of-week preference), plus **Last week** (full).

- **Comparison:** each current period is compared with the same number of days at the start of the previous unit. On the 10th of a month, it's 1–10 of the previous month; on Wednesday, Monday–Wednesday of last week. A partial period never looks like a collapse.
- **"Last week":** compared with the week before.
- **Old choices:** the existing 4- and 12-week choices are removed. A stored choice that no longer exists falls back to "This week", as unknown values already do.
- **Resolution of "keeping up":** per day up to a month, per week for a quarter, per month for a year.

### D4. Definitions of the new measures

- **On time:** of the tasks completed in the period that had a due date, the share completed on or before the logical day of their due date. Recurring occurrences count individually. With no such task, the tile shows "–" and "no due dates in this period".
- **Streak:** the number of consecutive logical days, ending today (or yesterday when today has no completion yet), with at least one counted completion. "Best" is the longest run within the last 53 weeks (the heatmap window). Habit skips are not completions (existing rule) and break nothing on their own, since the streak counts any completion.
- **Tracked vs estimate:**
  - the user's tracked minutes in the period (existing measure);
  - the summed estimates of the tasks those minutes were tracked on, counting each task once;
  - an entry on a task without an estimate adds to tracked only, and the tile says how many tracked tasks have no estimate.
- **Estimate accuracy:**
  - Base: tasks completed in the period with an estimate and at least 5 minutes of own tracked time; ratio = tracked / estimate.
  - Headline: the median ratio ("most tasks take 1.3× their estimate").
  - Groups: projects and labels with at least 3 such tasks, ranked by how far their median is from 1, top 3.
  - Fewer than 3 tasks in total: the panel explains what it needs instead.
- **When you get things done:**
  - Completions by logical weekday × local clock hour, with the hours laid out from the day start (a 04:00 day start runs 04…03).
  - Shown as a 7 × 24 dot grid; dot area encodes the count, and the value is in the tooltip and the table.
- **Heatmap:**
  - The last 53 weeks ending today, columns are weeks starting on the user's first day of the week, counts per logical day, five buckets by quantiles of the non-zero days.
  - Independent of the period chooser, and labelled with its own range.

All counts use the existing "what is counted", "excluded rows" and "whose tasks count in shared projects" rules.

### D5. "Keeps slipping" comes from the local activity record

There is no synced history of due-date changes on a task. The op schema is last-writer-wins registers, and a counter field would not converge under concurrent increments. The device already keeps an `activity` table of the ops it applied (kind `rescheduled` when `due` changes), capped at 500 events per project.

**Rule:** an open live task belongs to the panel when the local record holds three or more `rescheduled` events for it within the last 90 days that moved the due date later or removed it.

- **Limit:** devices that installed recently or synced less can see fewer events. The panel says "on this device", and the spec exempts this panel from "two devices agree".
- **Alternative considered:** fetching history from the server. Rejected because Statistics never makes a request.
- **Alternative considered:** a synced `due_moves` counter. Rejected because it doesn't converge; a grow-only structure would need an op-schema design doc.

### D6. Accessibility pattern, shared by every chart

- Each chart is a `<figure>` with a heading (the question it answers), an SVG with `role="img"` and a one-sentence summary as its accessible name, and a "Show as table" disclosure that renders the same values as a real table. The table stays visible when "Reduce motion" or forced colours are on.
- Interactive marks (heatmap cells, dots, line points) form one roving-tabindex grid per chart. The arrow keys move, and the focused mark shows the same tooltip a pointer gets ("Tue 14 Oct: 5 completed").
- Hit targets are at least 24 × 24 px even when the mark is smaller, and touch shows the tooltip on tap.

### D7. Layout and the interface budget

- **Page header:** the title, then the period chooser as the header's second row (it already counts), and the existing menu (Export time entries). Nothing between the header and the first panel.
- **Content:** a single content scroller, no nested scroll regions. The heatmap scrolls sideways inside its figure on phones (a designated horizontal region, not a vertical one), with today's week in view.
- **Grid:** two columns from 1024 px, one below. The tile row wraps 4 → 2 → 1. No new shortcuts; `g` `Shift+S` and the period chooser's arrow keys stay as they are.

### D8. Performance

One pass over the counted tasks builds every per-day and per-hour bucket for the 53-week window. The period panels then slice those buckets instead of re-scanning tasks.

- **Memoisation:** the pass is keyed on the Dexie change counter, so changing the period costs only the slicing.
- **Activity scan:** for "keeps slipping", bounded by the per-project cap (500), read once per open.
- **Off the main thread?** No worker for now: 20,000 tasks × one pass measured under 30 ms in a quick estimate. A test fixture with 20,000 tasks guards the budget.

## Risks / Trade-offs

- [A heatmap with a ramp of the accent may fail contrast on some accent themes] → validate each built-in accent's ramp with the palette validator in a test; fall back to a neutral ramp for an accent that fails.
- ["Keeps slipping" differs between devices] → labelled "on this device", exempt from the agreement rule, and links straight to the tasks so the user can act.
- [Streaks can feel like gamification] → no badges, points or prompts; the streak is a plain number next to the others. Turning it off is not offered, since it is one tile among four.
- [Removing the 4- and 12-week periods changes a familiar view] → the quarter covers the 12-week use; the review's "last week" stays.
- [More panels make a long page on phones] → panels are ordered by question (tiles, keeping up, time, rhythm, slipping), and empty panels collapse to one line.

## Migration Plan

Nothing synced changes. The stored period key (`ot.stats.period`) falls back to "This week" for removed values. Rollback is reverting the web change.

## Open Questions

- The exact wording of each panel's empty state and question heading; settled with the translations.

## Implementation notes

Recorded while applying the change (tasks 3.3, 5.1, 5.2).

- **Size (task 3.3).** `npm run build`: the lazy `ReviewBundle` chunk goes from 44.64 KB (13.43 KB gzipped) on main to 66.89 KB (21.33 KB gzipped), +7.9 KB gzipped, inside the 12 KB budget. The main bundle is unchanged (323.80 → 323.78 KB gzipped). The image grows only by the embedded web build; no dependency, no runtime memory beyond the open page.
- **Speed (D8).** In vitest on the development laptop, the one-pass model for 20,000 tasks and 5,000 entries builds in about 55 ms, and slicing all five periods takes about 49 ms in total. The test bound is 250 ms so a busy CI runner does not flake; `PERF=1` prints the numbers.
- **Ramp (D2).** `color-mix(in oklab)` of the chart base (the accent in light, the accent text in dark) into the surface at 49 %, 66 % and 82 %, with step 1 a neutral "none". Checked for all eight accents in light and dark by `chartRamp.test.ts` with the dataviz validator's ordinal rules (monotone lightness, gaps ≥ 0.06, light end ≥ 2:1, top step ≥ 3:1); the validator itself passes on the coloured steps. The 8-point OKLab gap is kept between "none" and the first colour, not between coloured steps, which cannot meet it while also clearing 2:1.
- **Layout (task 5.1).** `scripts/e2e-layout.mjs` gained a `stats` screen; `ONLY=stats` passes in Chromium and WebKit at 360, 390 and 768 px, light and dark (no sideways page scroll, no small target outside the chart grids, axe clean).
- **Smoke (task 5.2).** Scripted with Playwright on the demo data at 1280 px light and 390 px dark: the five periods switch and update the tiles, the heatmap grid takes focus and two left arrows move two days back with the tooltip ("Mon, 19 Oct: 1 completed"), "Show as table" opens 13 month rows, the page never scrolls sideways, and no request leaves the page while Statistics is used (only the app's own boot requests before it).
- **Deviations from the spec text**, kept small and listed here for review:
  - The Streak tile shows the best run in 53 weeks instead of a change against the previous period: a streak has no meaningful "previous period" value.
  - Heatmap cells are 14 px on a fine pointer (24 px on touch, with sideways scroll). A 24 px pitch on desktop would make 53 weeks wider than the page; the same values are reachable by keyboard and in the table (WCAG 2.5.8 "equivalent" exception). The dot grid is 18 px on a fine pointer, 24 px on touch.
  - The heatmap and dot grid are HTML grids rather than SVG; the summary is the grid's accessible name.
  - In the heatmap, left and right move by day and up and down by week, so "two left arrows move two days back" holds with weeks as columns.
  - A repeating task is never listed under "keeps slipping": completing an occurrence moves its due date later by design.
  - The old figures "completed late", "slipped" and "overdue now" and their lists left the screen with "Breakdowns and charts"; the Loop pulse, the review and the digest keep using `compute()` unchanged.
