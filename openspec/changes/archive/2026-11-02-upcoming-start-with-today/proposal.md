# Proposal

## Why

People who plan "now and next" in one place have to switch between Today and Upcoming, or build a saved view (`due <= 7 days | deadline <= 7 days`) that only comes close: it has no This Evening, Blocked or Today limit, and it misses started tasks. GitHub issue #670 asks for Today and Upcoming in one list; the owner approved a small, opt-in option on 2026-11-02.

## What Changes

- **Start with Today**, a new item in Upcoming's page menu (the `⋯` button in the page header, next to Show repeating occurrences). Off by default.
- While it is on, Upcoming opens with Today's own groups, chosen and grouped by exactly the same rules as Today: **Earlier**, **Today** (with Morning and Afternoon when day parts are on), **This Evening**, **Blocked**, and, with a Today limit, **Waiting for a slot**. Then **Tomorrow** and the following days, as now. Each task is listed once: a task Today holds is not repeated under its later due date.
- Today's number of tasks in the combined list is Today's, so it agrees with Today and its sidebar count.
- **Personal and synced:** one new field of the user's preference row (`upcoming_today`). It applies offline at once, reaches the account's other devices and converges by last-writer-wins.
- Today itself does not change.

Not **BREAKING**: one additive op field, no environment variable.

## Out of scope

- Done today and Close the day in Upcoming: they look back at the day and stay on Today.
- Drops on the part-of-the-day headings inside Upcoming (they would change the part and keep the date).
- Display mode's Upcoming page, the briefing, `ot upcoming` and the agent tools' `upcoming` view: they keep listing the days after today. The CLI and the agents already ask for Today and Upcoming by name (`ot today`, `view: "today"`); making `upcoming` depend on a display preference would make the same call return different tasks per account.
- A folded Today block, or a configurable number of days.

## Roadmap

Community request GitHub issue #670 (Today and Upcoming in one view). Not a ROADMAP.md row; ships in 0.20.

## Capabilities

### New Capabilities

- `upcoming-start-with-today`: the option, what Upcoming shows while it is on, how it agrees with Today and how it syncs.

### Modified Capabilities

None. Today's grouping rules (`web-app`, `day-parts`, `today-closed-list`) are reused unchanged.

## Impact

- **Data model and op schema:** `user_prefs.upcoming_today` (string, default `""`, not content) in `internal/sync/ops.go`; generated `web/src/generated/opSchema.ts` and the schema fixture.
- **Web:** `lib/listGroups.ts` (Today's groups in one function used by Today and Upcoming), `lib/dayLists.ts`, `lib/userPrefs.ts`, `app/task-list/useListModel.ts`, `app/TaskListView.tsx`, `app/task-list/upcomingCompute.ts` (projected days keep Today's groups first), `app/task-list/ListGroups.tsx` (Earlier's fold choice shared).
- **Bundle:** a few hundred bytes in the main chunk; no dependency.
- **Docs:** `docs/today-and-upcoming.md`.
