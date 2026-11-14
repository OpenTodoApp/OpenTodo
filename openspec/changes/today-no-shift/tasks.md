# Tasks

## 1. Find the cause

- [x] 1.1 Reproduce with the tour and with a script that opens Today as a person does (cold load, and Inbox → Today inside the app) and records every `layout-shift` entry with its sources, rectangles, time and the page's outline. Verify: the entries name the briefing growing by a line (20 px at 360 px, 44 px at 768 px) when the notifications are read after the rows are drawn; numbers in the design.

## 2. Web app

- [x] 2.1 `useNotificationsRead` in `web/src/lib/localData.ts` (undefined until read); `useBriefing` answers `undefined` until the tasks, the notifications, the review row and the preferences are read. Verify: `npx vitest run src/app/task-list/listReady.test.tsx`, `npx tsc --noEmit`.
- [x] 2.2 The list's gate in `web/src/app/task-list/useListReady.ts`: a day page is not ready while its briefing is `undefined`; the header gets the briefing from the gate. Verify: the same test (nothing is drawn while the notifications are held, then the rows with the whole sentence; a hidden briefing never shows beside the rows; `ot:list-ready` once per list; the Inbox waits for no briefing), and the list, briefing, Today and review tests (`npx vitest run src/app/task-list src/app/Briefing.test.tsx src/app/perfMarks.test.tsx src/app/todayAgenda.test.tsx src/app/closedListToday.test.tsx src/app/review`).
- [x] 2.3 `npm test` and `npm run build` in `web/`; `node scripts/bundle-budget.mjs`. Verify: all pass.

## 3. The audit

- [x] 3.1 `scripts/ux-audit/tour.mjs` waits for `ot:sync-idle` before a browser context's first capture. Verify: `ONLY=today WIDTHS=360,768 THEMES=light LANGS=en node scripts/ux-audit/tour.mjs` reports M12 on Today at both widths with main's build (0.153 and 0.183) and no finding with this change (three runs); `node --test scripts/ux-audit/*.test.mjs`.

## 4. Checks in a browser

- [x] 4.1 Built app, seeded account, Chromium with touch at 360, 390 and 768 px: Today's layout shift on a cold load and on a navigation from the Inbox stays under 0.1 (table in the design). Verify: the script's numbers before and after.
- [x] 4.2 The first row is not noticeably later: tasks read → `ot:list-ready` with the gate off and on (34.5 → 43 ms at 360 px, 41 → 49 ms at 768 px), and `cold-start` of the 10,000-task account inside its budget in both profiles. Verify: the marks and `PERF_ONLY=cold-start node scripts/perf/run.mjs` before and after.
- [x] 4.3 Inbox, Upcoming and a project with the same script, unchanged by this change. Verify: the numbers in the report of this change (Inbox and Upcoming 0 to 0.003 cold; a project 0.008 to 0.076 cold, its own causes, see the design's open questions).
- [x] 4.4 At 1280 px with a mouse Today's findings in the tour are the same before and after, and its layout shift is unchanged. Verify: the two tour reports and the script.
- [ ] 4.5 On a phone, in the Android and the iOS app: open Today from a cold start and from the Inbox tab; the list does not move after it appears.

## 5. Docs and release

- [x] 5.1 `docs/interface-guide.md` ("Loading moves nothing" names the briefing) and `docs/design-system.md` (the audit measures a synced device). Verify: `make docs`, `make docs-check`.
- [x] 5.2 Changelog fragment `changelog.d/Fixed/today-no-shift.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
