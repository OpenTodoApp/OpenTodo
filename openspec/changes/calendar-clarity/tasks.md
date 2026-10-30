Each group can land as its own PR, in any order.

## 1. Deadlines on the calendar

- [ ] 1.1 `web/src/lib/calendar.ts` `deadlineMarkers(tasks, from, to)` (open, not deleted, non-archived; same-day task gets the diamond instead); `calendar.test.ts`
- [ ] 1.2 Day and Week all-day strip chips (before events, shared three-chip limit), the diamond on same-day blocks and lane rows; happy-dom `calendarDeadlines.test.tsx`
- [ ] 1.3 Month cell deadline rows in "+N more"; Plan column markers; dimmed past; keyboard open; tests in the same file
- [ ] 1.4 Capacity unchanged by markers (assert in `calendar.test.ts`)

## 2. Add with the pointer (#555)

- [ ] 2.1 `AddOnDayDialog` takes an optional time; existing Month `q` and Plan tests pass
- [ ] 2.2 Day and Week: double-click on empty grid and lane, the context menu (Add task here…, an extension point for New frame here… and New slot here…; New frame here… calls `requestFrameAt(weekday, start)` from `app/calendar/framesRequest.tsx`, shipped with `calendar-frames`), touch long press, the slot highlight; `calendarAdd.test.tsx`
- [ ] 2.3 Month: double-click, context menu, hover surface; double-click on a row still opens the task; tests in `calendarAdd.test.tsx`
- [ ] 2.4 `q` in the `calendar` scope for Day and Week; the shortcut registry test passes with no conflict; cheat sheet lists it

## 3. Colour by (#554)

- [ ] 3.1 `colorBy(task, mode, labels)` helper beside the hue mapping; unit tests for label order, grey labels skipped, priority hues, neutral fallback
- [ ] 3.2 Calendar overflow item, `calendar.colorBy` device meta; blocks, Month rows and Plan rows use the helper; contrast test of the edge at 3:1 for every priority hue in light and dark
- [ ] 3.3 Boards: display panel choice for board views, overflow item on project boards, `board.colorBy`, card leading edge; `boardColour.test.tsx`
- [ ] 3.4 Story states for each mode (calendar and board) and baselines; `make ui-lint`

## 4. Filter and the project Calendar layout (#556)

- [ ] 4.1 Reuse the list filter popover (query and label checkboxes) for the Calendar (overflow Filter…) and Upcoming (under the duration filter); `calendar.filter` and `upcoming.filter` device meta; the chip in the header's lead line; `budget.test.tsx` passes (no extra row)
- [ ] 4.2 Filter applies to tasks and deadline markers, not events, frames or the planning list; capacity tooltip "n hidden by the filter"; invalid query keeps the last valid; `calendarFilter.test.tsx`
- [ ] 4.3 `ProjectViewMode` gains `calendar` (`web/src/lib/sections.ts`, `nextViewMode`), the layout switch item, the project page rendering the Calendar narrowed by project id and descendants, the planning list source; `projectCalendar.test.tsx`
- [ ] 4.4 Phone: the project Calendar follows the calendar's phone rules; `make layout-check` at 360 and 390 px

## 5. Docs, strings, checks

- [ ] 5.1 Strings in the six catalogs; `make i18n-check`
- [ ] 5.2 `docs/calendar-views.md`, `docs/place-tasks-on-the-calendar.md`, `docs/deadlines-and-start-dates.md`, `docs/filters.md`, the boards guide; screenshots refreshed where the calendar changed; `make docs-check`
- [ ] 5.3 CHANGELOG Unreleased "Added", naming #554, #555 and #556
- [ ] 5.4 `cd web && npm test && npm run build`; `make openspec-validate`; `make check`
