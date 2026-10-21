## Why

Statistics answers one question well ("how many did I complete this week?") and little else: five counts, a few bar charts and two task lists. People coming from commercial apps expect a dashboard that tells them something about how they work: whether they keep up with what they add, where their time goes, when they get things done, and what keeps slipping. All the data for that is already on the device (completions, creations, due dates, estimates, time entries, the local activity record), so the gap is presentation, not collection.

## What Changes

- Statistics becomes a dashboard of panels that each answer one question; no decorative charts:
  - **Headline tiles:** done, on time (share of tasks with a due date that were completed on or before their due day), streak (consecutive days with at least one completion, current and best) and tracked time against the estimates of the tracked tasks. Each tile shows the change against the previous period in words and with an arrow, never by colour alone.
  - **Keeping up:** completed and created over the period, as a line chart.
  - **Where time goes:** tracked time per project as horizontal bars. Without tracked time, completions per project.
  - **A year of done tasks:** a heatmap of completions per day over the last 53 weeks.
  - **When you get things done:** completions by weekday and hour of the day.
  - **Estimates:** how tracked time compares with estimates, as one sentence and the groups (projects or labels) that are furthest off.
  - **Keeps slipping:** open tasks whose due date was moved three or more times in the last 90 days, each linking to the task.
- The periods become **This week, This month, This quarter and This year**, each compared with the same stretch of the previous one. "Last week" stays as a fifth choice, since the weekly review uses it. **BREAKING** for nothing synced: the period choice is a device convenience.
- Every chart has a text equivalent (a table or list with the same values), works by keyboard, follows light and dark, and stacks into one column on a phone.
- Charts are hand-drawn SVG on the design tokens. No chart library is added.
- Out of scope: server-side statistics, sharing or exporting the dashboard as an image, team statistics across members, goals and targets, and any gamification (points, badges, levels; ROADMAP row 12 says "without the gamification"). The weekly email digest keeps its current numbers.

Advances ROADMAP.md row 12 ("Statistics and weekly review", shipped; this deepens its Statistics half).

## Capabilities

### New Capabilities

### Modified Capabilities
- `statistics`: new periods and comparison with the previous period; new measures (on time, streak, tracked against estimate, created against completed over time, completions by weekday and hour, estimate accuracy, tasks that keep slipping); the panels and their accessibility; the yearly heatmap; empty states; performance on large accounts.

## Impact

- `web/src/lib/stats.ts` (new measures and periods, pure functions with tests), `web/src/app/review/StatsView.tsx` and new chart components next to `Bars.tsx`; the review bundle stays a lazily loaded chunk.
- Reads the local `activity` table for "keeps slipping" (no new table, no new op field).
- `docs/statistics.md`, its screenshots, translations in every catalog, new workbench stories with visual baselines.
- No server, API, op schema, environment variable or dependency change. The image and binary grow only by the embedded web chunk (target under 12 KB gzipped for the new chart code).
- Depends on the time-tracking change's statistics delta (tracked time per day and project, the export); this change builds on that wording and must be archived after it.
