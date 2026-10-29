## 1. Schedule section

- [x] 1.1 `SidebarSchedule` in `web/src/app/calendar/` (fold state per device, the time now, items ahead with `scheduleAhead`, five rows and the calendar link, task to the side panel, event details), mounted in `Sidebar.tsx` above the footer outside the rail and drawer; tests in `web/src/app/sidebarSchedule.test.tsx` (`npm test`)
- [x] 1.2 Messages in every catalog (`make i18n-check`); a browser run at 1280×860 and 1280×600 with seven timed tasks (`npm run build`)
- [x] 1.3 Guide page `docs/sidebar-schedule.md` and the generated help (`make docs`, `make docs-check`)

## 2. Check

- [x] 2.1 `make check`
