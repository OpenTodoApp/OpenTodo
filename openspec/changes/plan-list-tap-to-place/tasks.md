## 1. Build

- [x] 1.1 `PlanRow`: a tap calls the view's `onTap` (registered only where the panel covers the calendar)
- [x] 1.2 `CalendarView`: tap placement on top of `placing`; close the list, bottom bar with title and Cancel (`role="status"`, focus on Cancel), reopen the list and focus the next task when it ends
- [x] 1.3 `DayColumn`: a tap on an empty time during a tap placement places the task at that quarter hour
- [x] 1.4 Tests: tap a task → bar; tap a time → due set with Undo and the list back; Cancel → no change and the list back; from 1024 px a tap does nothing new
- [x] 1.5 Bundle budget unchanged (Calendar chunk only); docs (`docs/calendar.md` or the planning-list guide) and a changelog fragment

## 2. Checks

- [x] 2.1 `make check` parts for web (typecheck, lint, tests), `make openspec-validate`, `make docs-check`

## 3. Real devices

- [ ] 3.1 The owner plans a task with two taps in the Day on an iPhone and an Android phone, and cancels one
