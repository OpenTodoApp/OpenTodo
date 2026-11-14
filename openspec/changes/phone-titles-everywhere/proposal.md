# Proposal

## Why

GitHub issue [#1351](https://github.com/OpenTodoApp/OpenTodo/issues/1351): `phone-row-titles` gave the task row two lines for a title on a phone, and its report listed the lists that still cut a title after one: the Notes list, the calendar's lists, Close the day and the command bar's results. At 360 px a note reads "Call the insu…", a search result "Book the venue for the autumn team dinner b…", and in Close the day a finished task with a long project name shows no title at all, because the project's name takes the whole line.

These lists draw their own rows, so the row's rule never reached them. They should follow it: one rule for a title on a phone, whatever list it is in.

## What Changes

- **One rule.** Below 768 px a title in these lists takes up to two lines, then ends with an ellipsis; with Show full task titles on it takes every line. From 768 px nothing changes: one line, as before.
- **Notes.** A phone's note row is its title on up to two lines and, under it, one line with when it changed and where it lives. While searching, the snippet has its own line between them. The title no longer shares its line with the place and the time, which left it about 15 characters.
- **Calendar.** The lists a phone shows instead of a grid: the focused day's list under the Month, the Week's day lists (tasks, repeating occurrences and a block's checklist) and the Plan's days. The time, the estimate, the priority and a span's day stay on the title's first line; a one-line row keeps its 44 px.
- **Close the day.** The three steps' task lists. In What got done and Tomorrow's first thing the project's name takes at most a third of the line, so the title is always there.
- **Command bar.** A result's name takes two lines on a phone; its second line (where it is, the snippet) stays one line.

Unchanged, because their height or shape is the design: blocks in the time grid of Day and Week and the all-day lane above it, a Month cell's rows and a Plan column's rows (640 px and wider), deadline markers and calendar events, the chip of the selected task in the command bar, board cards (two lines already), pickers other than the command bar, and the task row itself.

Out of scope: the task row (`phone-row-titles`), the phone header (`phone-header-room`), the bar's controls (`phone-bar-overflow`), pressed states (`touch-pressed-states`), a new preference, and any change from 768 px.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`); the web app in a phone browser gets the same lists.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: a new requirement, "Titles on a phone outside the task row", for the lists above and the preference.
- `notes-page`: "Notes page on phones and from the keyboard" describes the phone row as a title and a line under it instead of one line.

## Impact

- `web/src/index.css`: two classes, `.title-phone` (the title) and `.title-phone-row` (a 44 px row around it).
- `web/src/ui/TruncatedText.tsx` (`wrap="phone"`), `web/src/ui/Combobox/Combobox.tsx` (the palette look), `web/src/app/notes/NoteRow.tsx`, `web/src/app/TaskRow.tsx` (the compact row's phone shape), `web/src/app/calendar/{MonthRow,PlanRow,WeekAgenda,projections}.tsx`, `web/src/app/MonthView.tsx`, `web/src/app/review/{CloseDay,CarryOver}.tsx`.
- Tests in `web/src/app/fullTitles.test.tsx` and `web/src/ui/tooltip.test.tsx`; `docs/row-layouts.md`, `docs/notes.md`, `docs/interface-guide.md`.
- No script, no string, no op field, no server change, no dependency.
- Visual baselines at phone width change for the Notes rows (every row), and for the calendar agendas, Close the day and the command bar wherever a title is longer than one line.
