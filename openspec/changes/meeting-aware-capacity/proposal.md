# Meetings count toward the day's capacity

## Why

A day with three hours of meetings does not have eight hours for tasks. Day, Week and Month compare the day's task estimates with the day length and say nothing about the meetings already on the grid: `time-blocking` "Overlap and capacity" says events "SHALL NOT count toward the sum", so a day reads `4h 15m / 8h` while only five hours are free. Sunsama and Morgen subtract meetings from the workday, and the research names this as the first of three planner primitives that separate OpenTodo from replacing them ("4h 15m tasks + 2h 30m meetings / 8h, warning in amber when tasks plus meetings exceed the user's workday length"; research §"Commercial daily planners" and roadmap P2.3). The Plan already counts busy event minutes (`planner-view` "Event minutes in the capacity"); Day, Week and Month should be able to say the same thing.

## What Changes

- A new per-device option, **Count meetings in capacity**, in Settings › Calendar next to Day length, off by default. It is offered only while the device knows at least one subscribed or connected calendar.
- With it on, the capacity line of each Day and Week column and of each Month cell sums the day's task estimates and the day's **event minutes**, computed exactly as the Plan computes them today (busy timed occurrences of enabled calendars shown on this device, overlaps counted once, all-day and free events left out, split at midnight in the viewer's zone).
- The line reads `6h 45m / 8h`; its tooltip reads "4h 15m of tasks, 2h 30m in meetings · 3 tasks without estimate".
- Two tones when the day is over: the **danger** tone, as today, when the tasks alone exceed the day length; the **warning** (amber) tone with "Over with meetings" when only tasks plus meetings exceed it. Both are announced to assistive technology.
- When the device's **Calendars** toggle hides events, nothing is counted and the line is today's, so what is counted is always what is drawn.
- Offline, a day outside the device's event cache counts zero event minutes and the tooltip says calendars are unavailable for that day, as the Plan does.

Not **BREAKING**: no op field, no route, no environment variable, no server change.

Out of scope:
- The Plan's capacity bar, which already counts events and is unchanged.
- Counting all-day events, tentative events as half, or travel time.
- A synced (account-wide) version of the option: the day length it compares with is itself per device.
- Re-planning the day around meetings (`replan-the-day`) and Frames (`calendar-frames`), which are separate changes.

ROADMAP: 0.18 "The mindful daily planner", `meeting-aware-capacity` (research P2.3).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `time-blocking`: "Overlap and capacity" lets events count when the option is on and adds the warning tone; "Grid preferences" gains the option.
- `month-view`: "Cell contents" uses the same sum and tones in a Month cell.

## Impact

- Data model, sync, op schema: none. The option is one more key in the device's `calendar.grid` meta value (`web/src/lib/calendar.ts` `GridPrefs`, `normalizeGridPrefs`), never synced.
- E2EE: none; event minutes come from the device's decrypted-at-rest event cache and no content is read.
- API, CLI, MCP: none; capacity is a display of the web client. The CLI and MCP do not show capacity today, and still do not.
- CalDAV and vault: none.
- Code: `web/src/lib/calendar.ts` (`dayLoad` takes optional event minutes and returns the two over states), `web/src/lib/plan.ts` (`eventMinutes` reused, moved to `calendar.ts` if that keeps imports one-way), `web/src/app/calendar/DayColumn.tsx`, `web/src/app/MonthView.tsx`, the shared `CapacityLine`, `web/src/app/CalendarSettings.tsx`, `web/src/lib/settingsCopy.ts`.
- Bundle: a few hundred bytes; no dependency. Binary: unchanged.
- Docs: `docs/time-blocking.md`, `docs/other-calendars.md`, the Settings › Calendar guide; strings in the six catalogs; CHANGELOG.
