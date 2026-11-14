# Tasks

## 1. Web app

- [x] 1.1 `web/src/ui/useHeaderRoom.ts`: `useNarrow` (an element narrower than 40 rem on touch, 28 rem with a mouse) and `useCut` (one line wider than its box). Verify: `npx vitest run src/ui/patterns/narrowHeader.test.tsx`, `npx tsc --noEmit`, `npx eslint` on the changed files.
- [x] 1.2 `PageHeader` measures its own element: Help in the menu, the title's flex rule in a narrow compact header, the lead line whole or hidden. Verify: the same test (narrow with and without a menu, wide, a cut and a whole lead), `src/ui/patterns/pageRhythm.test.tsx`, `src/ui/patterns/phoneBarHelp.test.tsx`.
- [x] 1.3 Lists: `usePhoneListActions` takes the list's root and counts a narrow column as the phone; the project header's lead is its plain text there. Verify: `npx vitest run src/app/projectHeader.test.tsx src/app/precisionPhone.test.tsx src/app/task-list`, and 2.1.
- [x] 1.4 The task page: `TaskPath back`, the nearest step as a back arrow with its name, whole or carried by the arrow. Verify: `npx vitest run src/app/task-detail/taskPathBack.test.tsx`.
- [x] 1.5 Statistics: the period button and the export in the header's row in a narrow column. Verify: `npx vitest run src/app/review/statsView.test.tsx`.
- [x] 1.6 A routine's name in its path is `TruncatedText`. Verify: `npx tsc --noEmit`, and 2.1 (no cut text without its full text on the routine page).
- [x] 1.7 `npm test` and `npm run build` in `web/`; `node scripts/bundle-budget.mjs`. `src/app/addBelow.test.tsx` typed its second line before the add line was drawn again under the first task, and lost that race more often with this change (3 of 5 parallel runs; none on main): it now waits for the line. The full run had three more failures under machine load (`tabBar`, `lineageRows`, `perfMarks`), which pass when run again.

## 2. Checks in a browser

- [x] 2.1 Built app, the tour's seed, Chromium with touch at 768 px (sidebar open and collapsed), 820 and 1024 px, and 1280 px with a mouse: the boxes of each header's children, cut text and the tour's M2 and M10 for every screen of the layout check, before and after. Verify: Inbox, a task's page, Statistics, the board and the columns project are one row at 768 and 820 px with the sidebar open (M10 1 → 0 on the Inbox and the task page, M2 4 → 3 on the board, 5 → 4 on the columns project); with the sidebar collapsed, at 1024 px and at 1280 px every measured header is as before, except a lead line that was cut (the columns project at 1024 px) and the Inbox beside the docked panel at 1024 px (three rows → two).
- [x] 2.2 At 768 px with touch: Select tasks, a duration filter and Help from the Inbox menu by tap; Help by Enter, End, Enter with focus back on the menu's button; the filter's chip in the row and cleared; a period by tap and by keyboard and the export in Statistics' menu; Layout, Share, Select tasks, the filter and Help in a project's menu; the back step of a task's page returns to the Inbox; a step that does not fit is the arrow alone with the name as its accessible name.
- [x] 2.3 The tour itself for the five screens at 768 px: `ONLY=inbox,task-panel,stats,board,columns WIDTHS=768 THEMES=light LANGS=en node scripts/ux-audit/tour.mjs`. Verify: no M10 on a header, M2 only on the columns project.
- [ ] 2.4 On a tablet held upright, in the Android and the iOS app and in a browser: the Inbox, a task's page, Statistics and a project with the sidebar open; the same with the sidebar collapsed.

## 3. Docs and release

- [x] 3.1 `docs/interface-guide.md` (a header follows its own width), `docs/getting-started.md` and `docs/statistics.md` (where Help and the period are on a tablet). Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Changed/tablet-header-room.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [ ] 3.3 Re-baseline the UI screenshots at 768 px of the pages with a menu (lists, a project in every layout, a task's page, Statistics, a view, the dashboard, Projects, a routine's page, the calendars).
