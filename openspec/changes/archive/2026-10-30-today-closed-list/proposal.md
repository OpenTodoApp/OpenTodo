# Proposal

## Why

Today is an open list: everything due, started or late lands in it, and on a busy week it holds twenty tasks that will never all get done. The research's section 2.2 (Burkeman, *Four Thousand Weeks*) names the remedy: a **closed list** with a fixed number of slots, where new work waits until a slot frees up, and a **done list** that records what was actually finished, including unplanned wins. OpenTodo has pieces of this (the Daily check's focus of three, the Completed logbook, Close the day's figures), but no cap on Today, no "done today" in Today itself and no way to record work that was never a task. Gap analysis rows "Closed-list WIP cap on Today" and "Done today bar + Log completed work" (P1.3) are Partial.

## What Changes

- **Today limit (opt-in).** A personal, synced preference "Today limit": Off (default) or a number of slots from 1 to 20 (choices 3, 5, 7, 10, Custom). When it is on, Today fills its slots from the available tasks of Today and lists the rest in a folded **Waiting for a slot** group at the end. The fill order is first come, first served: today's focus, tasks the user let in, then Earlier, then the remaining tasks by when they were created, so a task added during a full day waits instead of pushing out one already planned.
- **Take a slot.** A row action, a task menu item and a palette command "Take a slot" let a waiting task in for today; the last automatically filled task goes back to waiting. The choice is a personal list of task ids for the logical day on the user's `review` row, like today's focus.
- **Only available tasks count.** Blocked tasks keep their own group and never take a slot. Tasks that are not available under the rule of the parallel change `project-flow-modes` (a later task of a Sequential project or section) never take a slot either; this change depends on that rule and does not redefine it.
- **Done today.** An optional folded **Done today** group at the end of Today lists the tasks completed in the logical today, newest first, with its count; the circle reopens a task. The page lead line reads "3 of 5 · 4 done" while a limit is on.
- **Log a win.** From the Done today group, the palette and quick add's "Log as done" switch, the user adds a task that is already completed (completion time now, completed by them). It appears in Done today, Completed, statistics and Close the day's figures like any completion. `ot add --done` does the same from the CLI.
- **API, CLI and MCP.** `today_summary` reports the limit and which of Today's tasks wait for a slot; `ot today` prints a "Waiting for a slot" section and accepts `--all`; the slot rule is one pure function in Go and TypeScript pinned by shared vectors.
- **Progressive disclosure.** The limit and the Done today group are set in Settings → Preferences → Today and in Today's overflow menu, which offers them only in the modes "Lists with method hints" and "Full Open Loops method" (or once a limit is set). Simple-list users see no change.

Out of scope: a limit on Upcoming or other days, per-project or per-workspace limits, hard refusal of new tasks (a full Today never refuses a write; it only lists the task as waiting), streaks or scores for the done list, logging time or a duration with a win (the estimate field covers it), the Today display (`display-mode`) and the Today widget on Android, which keep listing all of Today (the display already ticks off tasks completed today). Morning, Afternoon and Evening groups are the separate change `day-parts`; slots work across them.

Advances ROADMAP-1.0 0.17 "Calm constraints": `today-closed-list` (research §2.2, roadmap phase P1.3).

## Capabilities

### New Capabilities

- `today-closed-list`: the Today limit, the Waiting for a slot group, Take a slot, the Done today group, Log a win, their preferences and where they are offered.

### Modified Capabilities

- `mcp-server`: an added requirement that `today_summary` reports the limit and the waiting tasks.
- `cli-client`: an added requirement for `ot today`'s waiting section and `ot add --done`.

## Impact

- **Data model and op schema (additive):** `user_prefs.today_limit` (number, 0 = off; clients read anything outside 1–20 as off), `user_prefs.today_done` (string `shown`/`hidden`, empty reads per mode), `review.slots_date` (string, the logical date) and `review.slots` (string, comma-separated task ids), declared in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. No task field. A logged win is an ordinary task create with `completed_at` and `completed_by` in the same batch.
- **Sync:** personal rows only, last-writer-wins per field, written offline; no server behaviour change beyond the schema.
- **E2EE:** no new content field; the slot list holds ids only. A logged win's title is encrypted like any title.
- **API/CLI/MCP:** no new route. `today_summary` gains `today_limit` and per-task `waiting_for_slot`; `ot today` and `ot add --done`. The REST task create already accepts `completed_at`.
- **New Go package** `internal/closedlist` (pure, no dependency) with vectors shared with `web/src/lib/closedList.ts`.
- **CalDAV, vault:** no change (a logged win is a completed task like any other).
- **Size:** no dependency; a few kB of web bundle, negligible binary growth.
- **Depends on** `project-flow-modes` for the available-task rule; can ship first with "not blocked" as the rule and pick it up when that change lands.
