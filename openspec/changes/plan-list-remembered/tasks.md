## 1. Remembered state

- [x] 1.1 `PlanPanel.tsx`: read and save `opentodo.calendarPlan.open`; `usePlanPanel` with the toggle and the restore on arrival (wide screens, empty slot)
- [x] 1.2 `PanelFrame.tsx`: optional `onClose` for Close and Escape; the planning list saves closed through it
- [x] 1.3 Day, Week, Month and Plan use `usePlanPanel`
- [x] 1.4 Tests: open again on return; closed stays closed; a task opened from the Calendar does not forget it; a phone does not restore it

## 2. Docs

- [x] 2.1 The Calendar docs page: the list stays open between visits
- [x] 2.2 CHANGELOG Unreleased
