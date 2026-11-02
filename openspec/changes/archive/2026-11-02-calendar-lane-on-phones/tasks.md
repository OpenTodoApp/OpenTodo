## 1. Lane

- [x] 1.1 `laneShape`, the device choice `calendar.laneFold`, `COMPACT_LANE_QUERY` and `LANE_REGION_MAX` in `web/src/app/calendar/laneFold.ts`; verified by `npx vitest run src/app/calendarLaneFold.test.tsx` ("laneShape")
- [x] 1.2 The fold header with its count in `DayHeader`, inside the drop lane, open while the selection is one of its tasks; verified by `src/app/calendarLaneFold.test.tsx` (folds six tasks, opens, remembers; short lane; desktop unchanged)
- [x] 1.3 The capped scroll region of strips and lanes in `CalendarGrid`; verified by `src/app/calendarLaneFold.test.tsx` and screenshots at 360, 390 and 768 px

## 2. Now line

- [x] 2.1 The hour grid as its own stacking layer (`isolate`, `data-calendar-grid`); verified by `src/app/calendarLaneFold.test.tsx` (now line inside the grid layer) and the before/after screenshots

## 3. Docs and checks

- [x] 3.1 `docs/calendar-views.md`, CHANGELOG; verified by `make docs-check`; `npm test` and `npm run build` in web/, `make ui-lint`, `make openspec-validate`
