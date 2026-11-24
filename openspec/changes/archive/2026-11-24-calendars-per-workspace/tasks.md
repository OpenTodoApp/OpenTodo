## 1. Data

- [x] 1.1 `user_prefs.calendars_hidden` declared in `internal/sync/ops.go` and the generated files refreshed (`UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`); a user_prefs op with the field is accepted and stored (`go test ./internal/sync`)
- [x] 1.2 `readCalendarsHidden`, `hiddenIn` and `setCalendarHidden`: malformed values read as nothing hidden, stale workspaces and calendars pruned on write, `""` when nothing is hidden, one op (vitest `src/lib/calendarVisibility.test.ts`)

## 2. Web app

- [x] 2.1 `useVisibleCalendarEvents` used by `useCalendarFeeds` and Today's and Upcoming's agenda; free time still counts a hidden calendar (vitest `src/app/calendarsPerWorkspace.test.tsx`)
- [x] 2.2 The Calendars menu: the device switch first, one row per enabled calendar; unchecking hides the calendar in this workspace only, switching workspace shows it again, a new calendar shows, a value synced from another device applies, and below 768 px the rows follow the page menu's Calendars item (vitest `src/app/calendarsPerWorkspace.test.tsx` and the existing calendar tests)
- [x] 2.3 Catalogues without the two removed tooltips (`make i18n-check`)

## 3. Docs and check

- [x] 3.1 `docs/other-calendars.md`, `docs/calendar-events-in-today.md` and the changelog fragment; `make docs` and `make docs-check`
- [x] 3.2 `npm test` and `npm run build` in web/, `make bundle-budget`, `make check`
