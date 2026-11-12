# Proposal

## Why

Many habits don't fit a fixed schedule or a single tick. "Go to the gym three times a week" has no fixed days: as a calendar rule it either pins days the user doesn't keep or shows a miss on every day they didn't pick. "Drink eight glasses of water" or "read 20 pages" is an amount, not a yes or no. Research on habit trackers lists flexible scheduling as one of the forgiveness mechanisms that keep people going (Everyday-style weekly goals), and counted habits are the most common request after streaks. `habits-home` left both out because they need a different measure: periods against a target instead of matching dates.

## What Changes

- **Targets per period.** A habit can be "N times a week" or "N times a month", any day. It is offered every day until the period's target is met, then rests until the next period. No day is ever "missed"; a period is met or not.
- **Amounts.** A habit can have a daily amount with a unit ("8 glasses", "20 pages", "30 minutes"). The check button adds one step (+1, or a chosen step); a day reaching its amount is done, a day with less is a partial day that counts like the tiny version.
- **Measures for both.** The Habits screen shows "2 of 3 this week" or "5 of 8 glasses"; strength and streaks count periods for a target habit; the thread shows the week as one bar for a target habit and partial fills for an amount.
- **Everywhere else.** The form, the Today strip, editing past days, the weekly review, the server port, MCP's tools, the habits route, the CLI and the routine steps understand targets and amounts.
- **Exact sync for amounts.** Two devices adding a glass offline both count: each device keeps its own tally for a day, and the day's amount is their sum.

Not **BREAKING**: additive fields and one additive entity (`habit_tally`); no route, no environment variable, no change to the op log format.

Out of scope: "don't do" habits counted by slips; targets per day above one for non-amount habits; goals that change over time (ramping up); units conversion.

Builds on `habits-home`, `habit-notes` and `habits-assistant`. Archive after all three.

Roadmap: the "Habits area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `habits`: target habits per week or month, amount habits, their measures and states, and how the screen, strip, past days, tools and routes treat them.

## Impact

- Server: `internal/sync/ops.go` (`task.habit_target`, `task.habit_period`, `task.habit_amount`, `task.habit_unit` as content, `task.habit_step`; the entity `habit_tally` with `record_id`, `device`, `count`; its scope follows the record's task); `internal/habits` (period measures); `internal/agenttools` and the habits route (`amount` in `log_habit` and day states); regenerated schema files and the v1 surface snapshot.
- Web: `web/src/lib/habits.ts` and its vectors (periods, amounts, tallies), the form's How often and Amount choices, the thread's week bar and partial fills, the check button's step, the strip, past-day editing with an amount.
- Docs: `docs/habits.md`, `docs/recurrence.md`, `docs/mcp.md`, `docs/api.md`, `docs/sync.md` (the tally entity).
- Size: under 1 KB gzip on the first load; the rest in the Habits chunk.
