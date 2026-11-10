# Proposal

## Why

The Do on segment of the When popover (`web/src/app/task-detail/WhenControl.tsx`) is the editor people open most often, and the owner's feedback names four faults in it. The date field shows "Not scheduled" as its placeholder, so nothing says it takes text such as "tomorrow 3pm". "This Evening" is a switch even when the date is next Tuesday, where it reads as nonsense: the stored `evening` flag means "the evening part of the do-on day". "Add time" is a small button on the left that grows into a full row. The zone line ("Floating time · Change") then appears under it in a place that looks random. The segment stacks five blocks in a column where three would do.

A part of the day and a time are two answers to one question: when on that day? This change gives that question one control.

## What Changes

- The date field's placeholder shows how to use it with a localized example ("tomorrow 3pm, next fri"). The field also accepts a time, through the quick-add date reader the app already ships. A typed time sets the date and the time in one write.
- One row answers "when on that day": **Any time | Morning | Afternoon | Evening | Time**. Without day parts the row is **Any time | Evening | Time**. It replaces the This Evening switch, the day-part radiogroup and the Add time button. The word is "Evening", never "This Evening". "This Evening" stays only as Today's group heading, where the day is today.
- Choosing **Time** reveals one line under the row: the time field with its suggestions, then the zone behaviour as quiet text at the end of the same line ("Floating" or the city), which opens the existing zone choices. Nothing about zones is shown without a time.
- In this control a part and a time are exclusive. Choosing a time clears the part, and choosing a part clears the time. Each choice is one batch with Undo, written within the pairing the `day-parts` spec already requires. Other ways in (`Shift+E`, the Actions menu's "Day part…", dragging onto a heading, REST, CalDAV, the agent tools, 1.0 clients) are unchanged. A task that carries both shows both, and the stored part still wins for placement.
- The quick choices become one compact row: Today, Tomorrow, This weekend, Next week. The preview line takes no height when it is empty. "No date" goes, because Clear in the popover's footer does the same. The month calendar is unchanged.
- No new op field, entity, route, setting, dependency or shortcut. Not **BREAKING**: `due`, `evening` and `day_part` keep their meanings, and 1.0 clients read every value this control writes exactly as they do today.

Out of scope:
- The Start, Deadline, Repeat and Reminders segments.
- The task page's facts column and the facet line wording, apart from "Evening".
- Quick add's parser grammar.
- Changing what `evening` or `day_part` mean.
- New day parts.

Roadmap: the "UX polish (2026-11 feedback)" area of ROADMAP.md, row 2. It follows up `someday-and-evening` and `day-parts`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: the Do on segment's content and order (When popover shows one segment; Do on segment).
- `day-parts`: setting a part from the Do on segment's row, and the exclusive part-or-time rule there.
- `start-dates`: the panel wording ("the part of the day row" instead of the Evening toggle).

## Impact

- Web:
  - Edited: `web/src/app/task-detail/WhenControl.tsx` (`DoOn`, `EveningSwitch`), `web/src/app/datetime/DatePicker.tsx` (placeholder, compact quick choices, a time in typed text), `web/src/app/task-detail/ZoneControl.tsx` (an inline variant) and `web/src/lib/dayParts.ts` (one helper that builds the part-or-time batch).
  - The When popover stories.
  - Strings in every catalogue: new placeholder and row labels; "This Evening" stays for Today's heading.
- Server: none. `internal/daypart` pairing is unchanged.
- Docs: `docs/tasks-and-projects.md` (When and Evening) and the keyboard guide if any label changes (no key changes).
- Size: a few hundred bytes gzip in the task detail chunk. The quick-add date reader is already in the first load, so no new code loads. The first-load budget stays as it is.
