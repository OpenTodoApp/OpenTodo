## 1. Web app

- [x] 1.1 `othersTasksShown` reads `all` as on and anything else as off; `setOthersTasksShown` writes one op (`userPrefs.test.ts`)
- [x] 1.2 `tasksForView` and `patchViewTasks` list tasks assigned to others in Today, Upcoming, Start with Today, Anytime and Someday only while shown; own and unassigned tasks are unaffected, and Assigned to me is unchanged (`listGroups.test.ts`)
- [x] 1.3 The menu item is offered in a shared workspace only, checked while on, hides and shows the other member's task in Today, and follows a value synced from another device (`todayAgenda.test.tsx`)
- [x] 1.4 Today's limit fills its slots without tasks assigned to someone else (`todayAgenda.test.tsx`)
- [x] 1.5 The string in every catalogue (`make i18n-check`)

## 2. Docs and check

- [x] 2.1 `docs/roles-and-assignments.md` (the guide pages stay under 600 words) and the changelog fragment; `make docs` and `make docs-check`
- [x] 2.2 `npm test` and `npm run build` in web/, `make check`
