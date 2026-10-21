# Tasks

## 1. Page header and the lead line

- [ ] 1.1 In `web/src/ui/patterns/PageHeader.tsx` render the title at the display step (`text-display` from `tokens-v2`, else `text-h1 tracking-tight font-semibold`) on its own line and `meta` as a lead line under it (`data-page-lead`, `text-meta text-muted`), and pass the lead line to the phone bar as `subtitle`; verify with `web/src/ui/patterns/pageTemplate.test.ts` (title line, lead line present only when `meta` is set, bar subtitle below 768 px) and `npm test`
- [ ] 1.2 Reduce the header's top padding by 0.25 rem so a page without meta grows by at most 4 px; verify with `budget.test.tsx` (Inbox first-task position unchanged within 4 px) and the layout check `make layout-check`
- [ ] 1.3 Update the `PageHeader` stories (title only, title with a lead line, with two actions, phone bar) in `web/src/ui/patterns/PageHeader.stories.tsx` and `Screens/Today`; verify they render in `npm run storybook` and `make ui-check` passes once baselines are regenerated from CI's ui-check artifact or `make ui-baselines`

## 2. Two frames

- [ ] 2.1 Add `data-page-frame="standalone|layout"` to `PageBody` and the task lists' `PAGE_FRAME` (`TaskListView.tsx`: a project, a saved view with a board or timeline and the calendars are `layout`, everything else `standalone`), a CSS rule in `index.css` giving a standalone frame `max-width: calc(var(--page-width) + 2 * var(--page-gutter))` centred, and the `wide` width to a project's list layout; verify with `pageTemplate.test.ts` (frame kind per view; a standalone frame's width equals its content width plus gutters; a layout frame is 80 rem) and `npm test`
- [ ] 2.2 Slide a standalone frame when the panel column opens or closes (`transition` on the frame over `--duration-emphasis` with `ease-calm`, none under `prefers-reduced-motion`); verify with a happy-dom test that the frame carries the transition class and that the reduced-motion stylesheet rule zeroes it (`index.css` no-motion block), and by eye in `make dev` at 1920 px
- [ ] 2.3 Rewrite the frame step of `scripts/e2e-views.mjs` ("one page frame") to assert: standalone pages (Inbox, Today, Labels, Trash, Filter) share one left edge and are centred within 1 px at 1536 px; a project's list, board and timeline keep the title and the last action at the same place; opening a task at 1280 px does not move the title; verify with `make e2e`
- [ ] 2.4 Update `docs/interface-guide.md` (page template: the lead line, the two frames and the width table from design D3, the slide, "rows of chrome" as an element count) and `docs/views.md`; verify with `make docs-check`

## 3. Group headers

- [ ] 3.1 In `web/src/ui/patterns/ListGroupHeader.tsx` set the label at `text-meta font-semibold text-muted`, add `kind: 'generated' | 'named'` (`uppercase tracking-wide` for generated), `actionsAlwaysVisible`, and remove the `danger` tone; pass `kind` from `listGroups.ts` (generated: dates, Earlier, Today, This Evening, Blocked, Later, Completed, No section; named: sections, projects, labels); verify with `web/src/ui/patterns/patterns.test.tsx` (no danger class exists; generated vs named classes; the DOM text keeps its case) and `web/src/app/groups.test.tsx`
- [ ] 3.2 Update `ListGroupHeader.stories.tsx` (generated, named, collapsed with count, always-visible actions) and the Screens/Upcoming and Project stories; verify with `npm run storybook` and `make ui-check` once baselines are regenerated
- [ ] 3.3 Translate nothing new here but confirm `node scripts/i18n-check.mjs` passes after the label changes (no string changed in this group)

## 4. Earlier

- [ ] 4.1 Rename Today's first group to "Earlier" in `web/src/lib/listGroups.ts` (group key `earlier`, so no stored collapse state carries over), `DailyCheck.tsx` and `display/DisplayScreen.tsx`; verify with `listGroups.test.ts`, `groups.test.tsx`, `closeDay.test.tsx`, `displayScreen.test.tsx` and `deadlineViews.test.tsx` ("Earlier" heading, no "Overdue" string anywhere in `web/src` except the filter keyword and its docs: a grep test in `web/src/lib/i18n/i18n.test.ts`)
- [ ] 4.2 Default collapse: add `EARLIER_KEY` beside `BLOCKED_OPEN_KEY` so that with no stored state the group is folded when it holds more than five tasks and open otherwise, remembered per device once toggled; verify with `listGroups.test.ts` (six tasks folded, five open, stored state wins) and `npm test`
- [ ] 4.3 Header actions "Move all to today" and "Reschedule…" on Today's Earlier header (always visible, ghost small buttons; Reschedule… opens the bulk Date choices), applied through the bulk batch to the group's task ids with the ten-second Undo toast and `Ctrl`/`⌘`+`Z`, keeping each task's time of day, writing only `due` on deadline-only tasks, moving a repeating task's occurrence, skipping read-only tasks and counting them in the toast; verify with a happy-dom test `web/src/app/earlierGroup.test.tsx` covering every scenario of "Standard views" (move, reschedule offline with fake-indexeddb, undo, deadline-only, read-only count) and `npm test`
- [ ] 4.4 Palette commands "Move earlier tasks to today" and "Reschedule earlier tasks…" in `web/src/app/palette/registry.ts`, offered only while Earlier is not empty, no keys; verify with the palette registry test (offered with two earlier tasks, absent with none; the shortcut registry conflict test still passes)
- [ ] 4.5 Phone: at 375 px the two actions wrap under the label with no horizontal scroll; verify with `budget.test.tsx` "Phone width" and `make layout-check`
- [ ] 4.6 Stories: Screens/Today with Earlier open (3 tasks), collapsed (8 tasks) and empty, at 375 and 1280 px in both themes; verify with `npm run storybook` and `make ui-check` once baselines are regenerated
- [ ] 4.7 Docs: `docs/today-and-upcoming.md` (Earlier, the two actions, the default collapse), `docs/bulk-actions.md` (group actions), `docs/display-mode.md`; verify with `make docs-check`

## 5. The due ladder

- [ ] 5.1 Add `dateTone(task, today): 'muted' | 'default' | 'accent' | 'danger'` to the row detail module and use it in `TaskRow.tsx`, the board card and the display for Calm rows (Detailed unchanged); verify with `web/src/app/rowDetail.test.tsx` covering the four scenarios of "Due ladder in Calm rows" (tomorrow default, today untimed accent, midnight advance through `useToday`, deadline countdown keeps warning) and `taskRow.test.tsx`
- [ ] 5.2 Add the ladder states to `taskRow.stories.tsx` (later, tomorrow, today untimed, today timed, earlier) in Calm; verify with `make ui-check` once baselines are regenerated
- [ ] 5.3 Document the ladder in `docs/interface-guide.md` (rows and chips) and `docs/tasks-and-projects.md`; verify with `make docs-check`

## 6. Words

- [ ] 6.1 Replace the interface words: the review's Look back note ("n from earlier"), Carry over's line ("still open from earlier"), and every remaining "Overdue"/"overdue" string in `web/src` outside the filter keyword and its help; add the German, French, Spanish, Italian and Portuguese translations to `web/src/locales/*.json`; verify with `node scripts/i18n-check.mjs`, the grep test from 4.1 and `closeDay.test.tsx`
- [ ] 6.2 Digest: change the section heading to "Still open from earlier" in `internal/mail/templates/digest.{en,de,fr,es,it,pt}.txt` and regenerate and review the goldens in `internal/mail/testdata`; add a test asserting no rendering contains "overdue" or its translation; verify with `go test ./internal/mail/... ./internal/digest/...`
- [ ] 6.3 Docs: `docs/method/rhythms.md`, `docs/review-and-statistics.md`, `docs/email.md` (digest), `docs/filters.md` (note that the query keyword `overdue` lists the Earlier tasks); verify with `make docs-check`

## 7. Integration

- [ ] 7.1 After `calm-rows` and `time-tracking` are archived, fold the due ladder into "Metadata language" in `openspec/specs/task-list-presentation/spec.md` (one requirement, the ladder replacing the Calm date tones) and re-read "Page template" and "Standard views" against their archived text; verify with `make openspec-validate`
- [ ] 7.2 Regenerate the screenshots with `make docs-screenshots` (`today`, `upcoming`, `project-list`, `settings`, `display-today`, `review`) and verify the images show the lead line, the group labels, Earlier and a centred Today; verify with `make docs-check`
- [ ] 7.3 Add the ROADMAP.md row under "Next: Design refresh" and the CHANGELOG.md entry under Unreleased ("Overdue is now Earlier", the two actions, the lead line, the two frames); run `make check`
