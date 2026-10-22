# Proposal

## Why

The task row still says too much, and it says it in pills. After `calm-rows` a row in Today carries a time in accent, an estimate in a grey pill, label dots with a name, a project pill and a quiet counts group: four to six items in two or three styles under every title, and the Detailed mode brings back all seven in five colours. Todoist, Things and Linear show the same facts as plain muted text with a separator, and their lists read as titles with a few quiet facts. The October 21 interface review found the same thing from the screenshots: "chips are doing the job of typography", "everything has the same weight", and a day in Today does not scan as a schedule because the time is buried in the metadata line. This change makes the row one quiet row.

## What Changes

- **One row language.** Calm becomes the only row; the Detailed mode and the "Rows" choice in Settings → Appearance are retired. The synced `row_detail` preference stays in the schema, is still accepted and forwarded, and no longer changes anything (op fields are never removed).
- **A leading time column.** Between the checkbox and the title, a fixed-width column in tabular figures shows the due time, or the deadline countdown when the task has a deadline and no time, or nothing. It is shown for a whole list when at least one visible row has something to put in it, so a day scans like a schedule and titles align within a list. Board cards and the compact Plan rows show the same value first in their line instead of a column.
- **Metadata as muted text.** The metadata line is one run of muted text at the metadata size, items separated by a middle dot: the date words when the heading does not imply them, evening, the repeat word with its icon, start, deadline, estimate (or tracked against estimate), blocked, streak, custom field values and the origin. No neutral pills remain.
- **Labels are the only chips.** Each label is a small chip with its colour dot and name; up to two are shown, then "+n" with every name read out and in a tooltip. Everything else in the row is text.
- **The project at the row's end.** Outside the Inbox and the project's own view, the project name is right-aligned muted text at the end of the row, before the quiet counts group. Below 640 px it ends the metadata line instead.
- **Revealed row actions.** On a fine pointer from 768 px, hovering a row or holding focus inside it reveals three actions at the row's right edge over the counts: Schedule (the Do on popover, the same as `s`), Priority (the same as `1` to `4`) and More (the row menu, the same as `.`). They are real buttons reached by Tab from the row's open control, never hover-only, never rendered on coarse pointers, and they never resize the row.
- **Colour for meaning only.** The priority ring is coloured for P1 and P2 only; a date is in the danger tone only when overdue and in the accent only when it is a timed task due today; the deadline keeps its warning and danger tones; everything else is muted. These rules already hold for Calm and now hold everywhere, including the board, Plan, the review walk and Close the day, whose rows all come from the one row component.
- **Interface budget.** A task shows at most seven properties by default: the time column, the date words, the deadline or start, the estimate, the labels, the project and the counts group. The budget test pins the metadata line at five items.

Out of scope: the task panel's facet lines and chips; the sidebar; group headers and page titles (change `page-rhythm`); the completion animation and list reflow (change `motion-v2`); swipe actions on phones (change `phone-v2`); the tone and surface tokens themselves (change `tokens-v2`, which this change references for the muted and faint steps and falls back to the current tokens until it lands); the display routes' large-type rows; the Density preference, which stays; any new row field.

ROADMAP.md: advances the "Design refresh" section (one visual language) and the calm-interface work of `ux-overhaul` and `calm-rows`. No new environment variable; no op-log format change; nothing **BREAKING**.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `task-list-presentation`: the one row anatomy gains the time column and the trailing project; the metadata language becomes one muted-text language with label chips as the only pills; the Calm/Detailed split and the "Row detail in lists" requirement are removed; the selected and hovered row may reveal actions; new requirements for the time column, the revealed actions and the shared row on the board, Plan and review screens.
- `appearance-preferences`: the row detail preference becomes a retired field that is kept and ignored; Settings → Appearance no longer offers the Rows choice.
- `sections-and-boards`: a card's content follows the row language (time first, label chips, muted text), replacing "up to three chips and a footer".

## Impact

- Web app: `web/src/app/TaskRow.tsx` (the row, the card, a new compact variant for Plan), `web/src/app/calendar/PlanRow.tsx` (becomes the compact variant), `web/src/app/task-list/ListRow.tsx`, `ListGroups.tsx` and `useListModel.ts` (the per-list "has a time column" fact), `web/src/lib/listGroups.ts`, `web/src/ui/Chips.tsx` (`LabelChip` gains the dot, `NeutralChip` leaves the row), `web/src/lib/appearance.ts` and `web/src/app/AppearanceSection.tsx` (the Rows control goes), `web/src/app/budget.test.tsx`, `rowDetail.test.tsx`, `taskRow.test.tsx`, `taskRow.stories.tsx`, `board.stories.tsx`, `calendar.stories.tsx`, `index.css` (the time column width variable and the revealed-actions rule), five translation catalogs.
- Server: none. `row_detail` stays in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and `USER_PREFS_DEFAULTS`; nothing is renamed or removed.
- Docs: `docs/interface-guide.md` (Rows and chips), `docs/work-from-the-list.md`, `docs/settings-you.md` (the Rows row goes), `docs/design-system.md`, `docs/labels-and-filters.md`, `docs/time-tracking.md`, `docs/capture.md` where they describe Calm or Detailed; the Today, Upcoming, project list, board and Plan screenshots.
- No new dependency. Bundle: about −1 KB gzipped (the Detailed branches and the settings row go, the actions cluster and the column come).
