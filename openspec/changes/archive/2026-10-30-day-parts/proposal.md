# Proposal

## Why

Today is one long list sorted by due time and priority, with This Evening as the only split. The research (§1 TickTick complaint "habits jumbled in Today"; §1 Things "This Evening"; roadmap phase P1.2) shows people plan a day in parts: the morning routine and deep work, the afternoon errands, the evening. Habits in particular belong to a part of the day (stretch in the morning, read in the evening) but have to carry a fake due time to sort that way. Gap analysis row "Day parts morning/afternoon/evening for tasks and habits" is Partial: only `evening` exists.

## What Changes

- **A Morning and Afternoon part, beside the existing evening flag.** A task gets an optional, additive `day_part` field (`morning`, `afternoon` or null). The existing `evening` flag stays the one encoding of Evening, so old clients, CalDAV clients, the vault and every integration that knows This Evening keep working unchanged. A task's part is Evening when `evening` is set, else its `day_part`.
- **Day parts in Today (opt-in).** A personal, synced preference "Day parts" (off by default). When it is on, Today lists the day's tasks under **Morning**, **Afternoon** and **This Evening** after the tasks without a part (still headed **Today**). A timed task without a part falls into the part of its time (before 12:00 Morning, 12:00–17:59 Afternoon, from 18:00 This Evening); an explicit part wins over the time. Habits sit in their part like any task, which is the main point of the change.
- **Setting a part.** In the When popover's Do on segment the Evening toggle becomes a segmented "Any time · Morning · Afternoon · Evening" while day parts are on; dragging a task onto a part's heading in Today sets it; the task Actions menu gains a "Day part…" submenu; the palette has "Move to morning / afternoon / evening / any time". `Shift+E` keeps toggling This Evening. Setting a part writes `day_part` and `evening` together in one batch, so concurrent edits converge on one coherent part.
- **Quick add.** While day parts are on, `this morning` / `this afternoon` set today with that part, and a date phrase followed by `morning` / `afternoon` / `evening` (`tomorrow morning`, `fri evening`) sets that date with the part, in all six languages, in the TypeScript parser and the Go port with shared vectors. `tonight` / `this evening` keep their meaning in every mode.
- **Everywhere else.** Filter terms `morning` and `afternoon` beside `evening`; CalDAV `X-OPENTODO-DAY-PART`; the vault inline field `[daypart:: morning]`; `ot add/edit --part`; MCP `create_tasks`/`update_tasks` accept `day_part` and task results carry it.

Out of scope: user-defined parts or boundaries (12:00 and 18:00 are fixed in this change), parts in Upcoming, the calendar, Plan or the Today display (they keep the evening chip and show a part chip), reminders at the start of a part, a Night part, and importing parts from other apps. The Today limit of `today-closed-list` works across parts and is not changed here.

Advances ROADMAP-1.0 0.17 "Calm constraints": `day-parts` (research §1 TickTick and Things, roadmap phase P1.2); widens This Evening of `start-dates` without changing it.

## Capabilities

### New Capabilities

- `day-parts`: the `day_part` field and its relation to `evening`, the Day parts preference, Today's part groups, how a part is set, and how parts reach the API, CLI and MCP.

### Modified Capabilities

- `natural-language-capture`: added part phrases.
- `filter-queries`: added `morning` and `afternoon` terms.
- `caldav-sync`: added `X-OPENTODO-DAY-PART`.
- `markdown-vault`: added the `[daypart:: …]` inline field.
- `cli-client`: added `--part`.
- `mcp-server`: added `day_part` in task tools and results.

## Impact

- **Op schema (additive):** task field `day_part` (new kind: null, `morning` or `afternoon`; other values rejected like an invalid `start`), user preference `user_prefs.day_parts` (`on` or empty). Declared in `internal/sync/ops.go`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. Not content, so no E2EE field. No rename; `evening` keeps its meaning. Not **BREAKING**.
- **Sync and convergence:** per-field LWW; clients always write `day_part` and `evening` together (D2). An old client that sets This Evening on a morning task produces `evening: true, day_part: morning`, which reads as Evening.
- **Go:** `internal/quickadd` vocabulary and vectors, `internal/filter` keywords, `internal/caldav` mapping, `internal/vault` line grammar, `internal/agenttools` planning fields, `internal/cli` flags, activity labels in `internal/activity` and `web/src/lib/activity.ts` with the shared fixture.
- **Web:** `dayLists.ts`/`listGroups.ts` grouping, the When popover, the Actions menu submenu, drag targets, the preference in Settings → Preferences → Today and Today's overflow menu.
- **Size:** no dependency; small bundle and binary growth (vocabulary strings).
