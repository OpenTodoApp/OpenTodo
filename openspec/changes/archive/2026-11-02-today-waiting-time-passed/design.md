## Context

`today-waiting-time-sensitive` lists Today's waiting tasks with a time under the folded Waiting for a slot heading, soonest first, and names the first one "next". A task whose time had passed stayed first (D1 there) and was named next, with nothing to tell it apart.

## Decisions

### D1. Passed, in the shared rule
`timeSensitive(waiting, today, now)` (Go: `TimeSensitive(waiting, today, now)`) marks each entry `passed` when it has a due time and that time is before `now` ("HH:MM", compared as text). At the minute itself it has not passed. A deadline today without a time never passes during the day. The order is unchanged: by time, the deadlines without a time last, ties in fill order. Passed tasks still come first, because they are the soonest. `nextWaiting` / `closedlist.Next` is the first entry not passed. The cases in `closedList.vectors.json` carry `now`, `passed` and `next`.

`now` is the wall time of the logical today (`waitingNow`): after midnight and before the day start, the hours run past 24 ("25:30"), so every time of that logical day has passed while a deadline without a time has not. The CLI and the agent tools have no day start and read the wall time in their time zone.

### D2. What the folded group shows
A passed entry shows its time in the `danger` tone, the tone of an overdue date in rows (`ladderTone`) and of an overdue deadline, followed by the words **Time passed** in the same tone. The words, not only the colour, carry the state (WCAG 1.4.1). It keeps Take a slot. The heading's detail is "next: <title>, <time>" (or "deadline today") for `nextWaiting`. When there is none it is "time passed: <title>, <time>" for a single entry and "<n> past their time" for more. All of it is in the six catalogues.

### D3. Following the clock
`useWaitingNow` in `useClosedList.ts` reads now on each minute boundary while any task waits (one timeout, none otherwise), and `useListModel` passes it into the group input. A clock tick re-marks entries and can change the heading, but it never reorders the list.

### D4. CLI and agent tools
`ot today` prints the same heading words as D2 in English and appends "(time passed)" to those lines. `--json` adds `time_passed` (true or false) to each time-sensitive waiting task. `today_summary` adds `time_passed` to each time-sensitive waiting task, read against the asked time zone's wall time.

## Data model

None: no op field, entity or migration. Nothing new is written.

## Interface budget

Nothing above the list's first item changes. The marker is a word on an existing line of the folded group, and it is shown only when a time has passed. At 360 px the title truncates first. No new shortcut, destination or scroll region.

## Size

A few hundred bytes in the Today code. No dependency, no image or memory change.

## Risks

The minute timer runs only while tasks wait for a slot. A device whose clock is wrong marks times by its own clock, as the rest of Today does.
