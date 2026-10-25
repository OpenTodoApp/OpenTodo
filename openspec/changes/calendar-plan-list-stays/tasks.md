## 1. Fix

- [x] 1.1 `panelPage()` in `web/src/app/panel.ts`: the Calendar's ranges are one page for the stale-panel check; verified by `calendarPlanPanel.test.tsx`
- [x] 1.2 `usePlanActions` in `PlanPanel.tsx`, registered by `CalendarView`, `MonthView` and `PlanView`; Month's **Plan from a list**; verified by `calendarPlanPanel.test.tsx` (placing with `s` after Day → Month)
- [x] 1.3 Placement from the list with the keyboard (issue #352): focus to the grid after `s`, back to the list after Enter or Escape; `PanelFrame` `onEscape`; verified by `calendarPlanPanel.test.tsx` (Day and Week, keyboard only)

## 2. Docs

- [x] 2.1 `docs/place-tasks-on-the-calendar.md`, CHANGELOG
