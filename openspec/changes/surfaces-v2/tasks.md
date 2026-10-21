# Tasks

## 1. Surface classes and contrast pairs

- [ ] 1.1 Add the component classes `ui-block` (with `--dashed`, `--past`, `--late`, `--row` modifiers), `ui-block--event` (hatched edge, dot slot), `ui-column`, `ui-drop-placeholder`, `ui-card--lift` and `ui-section-flat` to `@layer components` in `web/src/index.css`, each composed of tokens only (design D1, D2, D3, D6, D7, D8, D9); verify `npm test -- tokens` passes (no raw colour, the two dark blocks identical) and the classes appear in `docs/design-system.md`'s surface table
- [ ] 1.2 Extend `web/src/ui/tokens/pairs.ts` with the pairs of the design's surface table: `text-strong` on `hue-<h>-soft` (4.5), `text-faint` on the dimmed soft fill (4.5), `border-input` on `sunken` (3), `hue-<h>-solid` on `canvas` (3) for every hue in both themes; verify `npm test -- contrast` passes, and record in design.md any hue value corrected to pass
- [ ] 1.3 Teach `src/ui/tokens/lint.test.ts` that `ui-column` and `ui-section-flat` are allowed surface classes while raw `rounded-card`/`shadow-*` in screens still fail, and that a raw `border-t`/`border-b` used as a section separator in a settings panel fails; verify `npm test -- lint` passes and a fixture file with a raw shadow still fails with file and line
- [ ] 1.4 Add stories `Foundations/Surfaces` showing the five surface styles and the block recipe for all twelve hues at rest, dashed, past, late and event, light and dark, 375 and 1280 px; verify `npm run storybook` renders them and the a11y gate (`node scripts/ui-check/a11y.mjs`) passes

## 2. Calendar blocks (Day, Week, Month, Plan)

- [ ] 2.1 Replace the block class strings in `web/src/app/calendar/DayColumn.tsx` (grid blocks and lane rows) and `calendar/WeekAgenda.tsx` with `ui-block` and its modifiers, keeping `data-hue`, the selection ring, drag and resize handles unchanged; verify `npm test -- calendarView` passes and the Week story shows filled blocks with a solid edge for estimated and a dashed edge for unestimated tasks
- [ ] 2.2 Apply `ui-block--past` to blocks and lane rows whose day is before the logical today (`useToday`), in `DayColumn.tsx`, `MonthView.tsx` and `calendar/PlanRow.tsx`; verify a happy-dom test in `calendarView.test.tsx` and `monthView.test.tsx` that yesterday's blocks carry the past class and today's do not, and that a past block still accepts arrow moves
- [ ] 2.3 Move `CalendarEvents.tsx` timed event blocks and the Plan's event rows to `ui-block--event` with the calendar dot before the summary, keeping free events as a dashed outline; verify `npm test -- calendarEvents planView` passes, the Week story shows an event told apart from a neighbouring task of the same hue by edge and dot, and the a11y gate passes
- [ ] 2.4 Cap the all-day strip at three chips per day with a "+N" ghost button that toggles a per-device `calendar.allDayExpanded` set in `localStorage` (cleared past 60 days), in `DayColumn.tsx`; verify a test that five all-day events show three plus "+2", that activating it shows five and survives a reload, and that the other days are unaffected
- [ ] 2.5 Extract `CapacityLine` (`web/src/app/calendar/CapacityLine.tsx`: muted, tabular figures, danger pair when over) and use it in `DayColumn.tsx`, `MonthView.tsx` and `PlanRow.tsx`, removing `font-mono`; verify `npm test -- calendar month plan` passes and `grep font-mono web/src/app/calendar` finds nothing
- [ ] 2.6 Pin the now line's "today only" behaviour with a test in `calendarView.test.tsx` (the Week shows one `data-now-line`, in today's column); verify `npm test -- calendarView`
- [ ] 2.7 Replace the task row class in `MonthView.tsx` with `ui-block ui-block--row`; verify `npm test -- monthView` passes and the Month story shows filled rows
- [ ] 2.8 Update `docs/calendar-views.md` (blocks, events, the all-day "+N", the now line) and regenerate `docs/images/day-*.webp`, `week-*.webp`, `plan-*.webp` and the month shots with `make docs-screenshots`; verify `make docs-check` passes and the images show filled blocks

## 3. Timeline bars

- [ ] 3.1 Draw bars in `TimelineView.tsx` with `ui-block` in the project hue, the part before today as a second segment with `ui-block--past`, and `ui-block--late` for a past deadline; verify `npm test -- timelineView` passes, including a new test that a late bar has the danger edge whatever the hue and that a bar across today has two segments
- [ ] 3.2 Add the "timeline with a bar across today and a past deadline" state to the project timeline story; verify `npm run storybook` renders it and the a11y gate passes
- [ ] 3.3 Update `docs/project-timeline.md` and regenerate its screenshot with `make docs-screenshots`; verify `make docs-check`

## 4. Board surfaces

- [ ] 4.1 Replace the column classes in `BoardView.tsx` with `ui-column`, move the count to `text-muted tabular-nums`, keep the section icon or dot and the rule mark in the header in the muted tone, and show the "Add a task" affordance inside an empty column's surface; verify `npm test -- boardView boardPhone` passes and the phone test still measures 88 % columns with the pager
- [ ] 4.2 Measure the dragged card's height in `useBoardDrop.ts` at `beginDrag` and render the `ui-drop-placeholder` after the last card of the active target column, with the origin card at reduced opacity, removing the column ring; verify a new happy-dom test in `boardView.test.tsx` that dragging over "Doing" renders one placeholder of the card's height there and none elsewhere, that releasing outside writes nothing, and that Shift+Right still moves without a placeholder
- [ ] 4.3 Add `ui-card--lift` to board cards; verify `npm test -- boardView` passes and a test asserts the class is present on cards and absent on list rows and settings cards
- [ ] 4.4 Add the stories "Columns with a styled, a filled and an empty column", "Card hovered", "Drag in progress" (placeholder and faded origin, using the drag primitive's test hook) and "Board of filters with a rule mark" to `web/src/app/board.stories.tsx`; verify `npm run storybook` renders them at 375 and 1280 px in both themes, the a11y gate passes, and the placeholder measures 3:1 in the gate's contrast check
- [ ] 4.5 Update `docs/sections-and-boards.md` and regenerate `docs/images/board-*.webp` and `eisenhower-*.webp` with `make docs-screenshots`; verify `make docs-check`

## 5. Settings tiers

- [ ] 5.1 Add `tier?: 'primary' | 'flat'` to `web/src/ui/patterns/SettingsSection.tsx` (flat renders `ui-section-flat`, primary keeps the card surface, both set `data-tier`); verify `npm test -- SettingsSection patterns` passes and the `Patterns/Settings` stories render both tiers at 375 and 1280 px in both themes
- [ ] 5.2 Pass `tier="primary"` on the one card per page named in the "Card tiers" requirement (session, How you work, two-factor, theme, start view, push, quick add, version, API tokens, export, users, backups); verify `npm test -- settings` passes
- [ ] 5.3 Extend `settingsAnatomy.test.tsx` to assert identical anatomy in both tiers and at most one `data-tier="primary"` per rendered page, naming the page and both cards on failure; verify `npm test -- settingsAnatomy` passes and a fixture page with two primary cards fails
- [ ] 5.4 Update the `Settings/Navigation` and section stories to show the primary card above flat sections; verify `npm run storybook` renders them and the a11y gate passes
- [ ] 5.5 Update `docs/settings.md` and `docs/interface-guide.md` ("Settings" section: tiers) and regenerate the settings screenshots with `make docs-screenshots`; verify `make docs-check`

## 6. Statistics tiles and panels

- [ ] 6.1 In `web/src/app/review/StatsView.tsx` set tile values at the display step (`text-display` from tokens-v2, else `text-h1`) with `tabular-nums`, the name above and the comparison below in `text-muted` with the arrow icon, keep tiles on the card surface and render the panels with `ui-section-flat`; verify `npm test -- statsView` passes, including a new assertion that panels carry no border or shadow class and tiles do
- [ ] 6.2 Add the tile states (positive, negative, "–" with reason) to `review.stories.tsx` at 375 and 1280 px; verify `npm run storybook` renders them without clipping at 375 px and the a11y gate passes
- [ ] 6.3 Update `docs/statistics.md` and regenerate `docs/images/stats-*.webp` with `make docs-screenshots`; verify `make docs-check`

## 7. Design system docs, baselines and integration

- [ ] 7.1 Update `docs/design-system.md` ("Three surfaces" becomes the five styles with their classes, the block recipe, the event style) and `docs/interface-guide.md` (rows and chips: blocks; the budget statement that no chrome row was added); verify `make docs-check`
- [ ] 7.2 Regenerate the visual baselines for every story touched (Foundations/Surfaces, Screens/Calendar, Screens/Board, Settings, Screens/Review and statistics, the timeline) from CI's ui-check artifact or `make ui-baselines` (Docker), commit the PNGs under `web/src/ui/__screenshots__/`; verify `make ui-check` passes in light and dark at 375 and 1280 px with the axe gate green
- [ ] 7.3 After `ux-audit-three-widths` and this change are both archived, fold the "Surface stories in the workbench" list into "Core screens in the workbench" in `openspec/specs/design-system/spec.md` and the screen inventory; verify `make openspec-validate`
- [ ] 7.4 Run `make check` and `make layout-check` (no horizontal overflow at 360 px on the Week, Month, Plan, board and settings pages), measure the CSS growth in `npm run build` output and record it in design.md, and add the CHANGELOG.md entry under Unreleased ("Changed: filled calendar blocks, neutral events, board column surfaces, settings card tiers, statistics tiles"); verify every command passes
