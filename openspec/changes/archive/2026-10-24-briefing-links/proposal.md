# Proposal

## Why

The briefing (`briefing`) tells you what stands out on Today and Upcoming, but it only tells. A reader on Reddit put it well: "The Today briefing could earn its space if 'two things are late' opens those exact two tasks. If it only repeats a count I can already see, I would hide it." The same reader asked that a project not be called "Slipping" without a short explanation. The All projects table shows that explanation beside the word, but below 36 rem (a phone) the reason is dropped and only the judgement is left.

## What Changes

- **The briefing's parts are links:**
  - A task the briefing names (one late task, the task a reply is about, tomorrow's first task) opens that task's page.
  - A count of late tasks ("2 tasks are late") selects exactly those tasks in Today's list (they are ticked, as with bulk selection, so the selection bar can reschedule them) and scrolls to the first. From the Daily check it opens Today first.
  - A full day ("Monday is already full") opens Upcoming at that day.
  - Replies that are not about one named task ("3 replies are waiting", "Mia replied") open the notifications.
  - Links keep the clause's tone; they are underlined on hover and keyboard focus, reachable with Tab, and their accessible name says where they go.
- **The briefing can be hidden:**
  - The day page's menu on Today and Upcoming offers "Hide briefing" (and "Show briefing" once hidden).
  - The choice is a synced preference for the account. Hidden, the day head keeps its title and date.
  - The Daily check keeps its opening sentence either way.
- **Health says why on narrow tables:** below 36 rem, where the detail beside the health word is dropped, the word shows the detail ("2 late", "passport", "9 days") in a tooltip on hover and keyboard focus, and in place under the word on a tap. Screen readers always hear the detail.

Out of scope:
- Turning single facts on or off; the briefing is shown or hidden as a whole.
- New facts or wording changes to the sentence.
- A filtered page of just the late tasks; Today already lists them.
- The health rules themselves.

This follows up the "Precision redesign" ROADMAP item (`briefing` and `projects-table`).

One additive synced field (`user_prefs.briefing`). No new environment variable, no migration. Not breaking.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: "Day page briefing" gains links and the hide preference.
- `project-organization`: "All projects page" says why on narrow tables.

## Impact

- `web/src/lib/briefing.ts`: late facts carry their task ids; `briefing.fixtures.json` follows.
- `web/src/app/Briefing.tsx`: the clauses as links; new `web/src/app/briefingLinks.ts` (reveal tasks in Today, open Upcoming at a day, open the notifications).
- `web/src/app/TaskListView.tsx`: the day page menu item and the preference; `NotificationBell.tsx` and `Shell.tsx` answer an "open the notifications" request.
- `web/src/app/ProjectsTable.tsx`: the health word's tooltip and tap.
- `user_prefs.briefing` in `internal/sync/ops.go`, `web/src/lib/types.ts`, `web/src/lib/ops.ts` and the shared schema fixture.
- A few new messages in each catalog. No dependency; bundle impact under 1 kB.
