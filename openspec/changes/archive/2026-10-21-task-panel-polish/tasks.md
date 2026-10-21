# Tasks

Frontend tasks are verified with `npm test` and `npm run build` in `web/` unless another command is named. Group 1 does not depend on `task-panel-facets`. Groups 2 and 3 come after it.

## 1. The conversation

- [x] 1.1 Make the tab bar sticky under the panel header (header height as a CSS variable) and keep its on-screen position on tab change (layout effect, `overflow-anchor: none`, min-height on the tab content); verify with `conversationTabs.test.tsx` (scrollTop restored so the bar's top is unchanged after switching from 14 comments to 3 activity entries) and a `Task/Panel` story at 1280×800 scrolled into the thread.
- [x] 1.2 Move comment actions into the header line without reserved height (hover and focus on fine pointers, a "More actions" menu on coarse pointers), set thread spacing, and scroll a posted comment into view; verify with `commentsTab.test.tsx` (no action row height at rest, the menu on coarse pointers offers Reply, Edit and Delete for own comments, a posted comment's element is scrolled into view) and the `Task/Comments` story baselines via `make ui-check`.

## 2. Toggle and the date picker

- [x] 2.1 Exclude the anchor from the outside-pointer test of `Popover` and make facet parts toggle; verify with `popover.test.tsx` (clicking the trigger while open closes it and it stays closed, ten clicks alternate) and a facet part case in `facets.test.tsx`.
- [x] 2.2 Add `quickChoices(kind, today, weekStart)` to `web/src/lib/dates.ts`; verify with `dates.test.ts` (This weekend on a Saturday is today, End of week follows the week setting, End of month on 2026-10-21 is 2026-10-31) and a cross-check against the parser for the six bundled languages.
- [x] 2.3 Extract `MonthGrid` from `DateField` and add `DatePicker` (quick choices, worded field with parse preview, inline grid); re-implement `DateField` on `MonthGrid`; verify with `datePicker.test.tsx` (quick choice commits, `fri` previews then commits on Enter, the field reads "Thu 22 Oct" in a day-month format, grid keyboard behaviour unchanged) and the existing `fields.test.tsx` passing.

## 3. The When segments

- [x] 3.1 Rebuild the Do on segment (quick choices, picker, Add time with suggestions, Remove time, Evening, the zone line only with a time, no inner clear); verify with `whenControl.test.tsx` (unchanged op payloads, Tomorrow in one click, no zone line without a time, "Floating time · Change" with one) and `zoneControl.test.tsx`.
- [x] 3.2 Rebuild the Start and Deadline segments with their quick choices and "No start date"; verify with `whenControl.test.tsx` (Next week start, Someday parks, End of month deadline, start after due still refused).
- [x] 3.3 Put presets in front of `RecurrenceField` with the rule in words and Custom…; verify with `recurrenceField.test.tsx` (each preset writes the rule the full editor writes, Custom… writes nothing until changed).
- [x] 3.4 Update the `Task/Panel` (the When popover on each segment) and `DateTime/Date picker` stories and baselines; verify with `make ui-check` (axe clean in both themes).

## 4. Docs and integration

- [x] 4.1 Update `docs/task-panel.md`, `docs/dates-and-times.md`, `docs/deadlines-and-start-dates.md`, `docs/recurring-tasks.md` and the matching Help pages; verify with `npm run docs:check`.
- [x] 4.2 Run `make check`; verify it passes, and record the panel chunk size difference here.
- [x] 4.3 Run `make openspec-validate`; verify it passes.

## Implementation notes

- Group 1 found a second cause of the jumping panel: `Tabs` revealed the selected tab with `scrollIntoView`, which also scrolled the panel vertically on every tab change. It now scrolls its own row sideways only (`ui/Tabs.tsx`).
- Groups 2 and 3: the toggle (2.1) landed with `task-panel-facets` (a part toggles its popover; `Popover` already ignored its anchor). The month grid was already shared as `CalendarGrid` in `DateField.tsx`, so `DatePicker` composes it inline (`compact`) instead of a new `MonthGrid`; `DateField` keeps its popover for other screens. Repeat presets write the canonical rule `parseRule` gives for "every day", "every weekday", "every <weekday>", "every <nth>" and "every year". Visual: only Task/Panel "When popover" changed, plus two new Date picker stories.

- Verified by CI on each merged pull request (#180, #181, #183–#189: Web, Server, Checks, Layout and UI checks). Entry chunk on main after the whole series: 323.79 KB gzipped (323.12 KB before `task-panel-facets`; facets alone −1.05 KB, the When editor, the title editors and inline editing together +1.72 KB).
