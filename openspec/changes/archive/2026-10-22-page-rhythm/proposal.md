# Proposal

## Why

Every page of the web app has the same weight: a 24 px title with its meta beside it, bold 17 px group headers, 15 px rows, and lists that start at the frame's left edge and leave the right third of a wide window empty. The eye has no path, and an ordinary Monday looks like an incident because "Overdue" is red three times over: the group name, every date and every P1 ring. The interface audit of 21 October 2026 (the UX analysis behind `ux-audit-three-widths`) found these four things on every list page, and they are the cheapest way to make the app read as finished: typography and space carrying the hierarchy, colour kept for meaning, and non-judgmental words for tasks that are late.

## What Changes

- **Title block.** The page title is set at the `display` type step (added by `tokens-v2`; until it lands, the h1 step with tighter tracking and 600 weight) and the page's meta (Today's date, planned and tracked time; a project's members and role; a label's count) moves from beside the title to a soft second line under it, in the muted tone at the metadata size. The two header actions, the overflow menu and Help stay where they are; below 768 px the shell's bar keeps carrying the title and shows the lead line as its subtitle.
- **Group headers.** List group headers become small labels at the metadata size: generated groups (dates, Earlier, Today, This Evening, Blocked, Later, Completed, No section) in uppercase with wide tracking, groups named by the user (sections, projects, labels) in sentence case, both semibold and muted, with the count in the faint tone and tabular figures. Collapse, hover actions, notes and the implied-facts rule are unchanged.
- **Two page frames.** A page that offers no layout switch (Inbox, Today, Upcoming, Anytime, Someday, Next, Waiting, Assigned to me, Completed, a label, Filter, a saved filter, Trash, Updates, settings, Import, Ask, Help, the review screens) is a *standalone page*: its frame is the page's width class plus the gutters, centred in the content column, header and content inside it, so the title and the content still share one left edge. A page with a layout switch (a project, a saved view that offers a board or timeline, the calendars) is a *layout page*: it keeps the one 80 rem frame of `ux-feedback-2`, so its title and actions never move between list, board and timeline; its list layout now spans the `wide` width so the right side is not empty. When the panel opens, the content column narrows by the panel's width and a standalone frame re-centres in what is left, sliding with the emphasis duration (instant under reduced motion); at 1280 px and below the frame already fills the column and nothing moves.
- **Earlier instead of Overdue.** Today's first group is named **Earlier**, its header in the default tone with a muted count; only each task's date stays in the danger tone. The header carries two always-visible actions, **Move all to today** and **Reschedule…**, which apply to every task of the group as one batch with Undo, and two palette commands offer the same. With more than five tasks the group is collapsed by default on a device that never opened it, showing its count and its actions. The Daily check, the Today display and the digest use the same word.
- **A due ladder, so nothing goes from invisible to danger overnight.** In Calm rows a task due tomorrow (or due today without a time) reads its date in the default text tone, one step stronger than later dates, a task due today in the accent tone (timed or not), and an earlier date in the danger tone; the deadline countdown keeps its neutral, warning and danger steps. No new colour.
- **Non-judgmental words.** "Overdue" leaves the interface, the Daily check, the Today display, the weekly review's Look back step, the carry-over step of Close the day and the weekly digest, replaced by "Earlier" (a group), "n from earlier" (a count) and "still open from earlier" (a sentence); "late" and "slipped" stay in Statistics as measurements, the deadline countdown keeps "nd over", and the filter query keyword `overdue` is unchanged.

Out of scope: the row's own anatomy, metadata chips and hover actions (`rows-v2`); the tokens themselves (`tokens-v2`); the completion and reflow motion (`motion-v2`); the sidebar (`sidebar-v2`); phone chrome, swipe and sheets (`phone-v2`); calendar and board surfaces (`surfaces-v2`); any change to which tasks Today, Upcoming or the Inbox list; the filter query language; the REST API and the op log (nothing is written by this change except the batches a user asks for).

ROADMAP.md: advances "Next: Design refresh" (the visual language step after `design-language` and `ui-primitives`); the change adds a row for itself there when it ships. No new environment variable; no op-log change; not BREAKING.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: "Page template" (lead line under the title; standalone and layout frames; the panel re-centres a standalone frame).
- `task-list-presentation`: "Group headers" (label style, Earlier's tone and actions, default collapse); ADDED "Due ladder in Calm rows" and "Words for tasks that are late".
- `web-app`: "Standard views" (Today's first group is Earlier; its actions).
- `deadlines`: "Deadlines in Today" (a past deadline joins Earlier).
- `display-mode`: "Today display" (Earlier).
- `bulk-actions`: ADDED "Group actions are one batch" (Move all to today and Reschedule… on a group reuse the batch, the review-free date path and the Undo toast).
- `email-digest`: ADDED "Digest words for tasks that are late".

## Impact

- Web app: `web/src/ui/patterns/PageHeader.tsx` and `PageBody` (lead line, `data-page-frame="standalone|layout"`, centring and the slide), `index.css` (frame rules, group label classes), `web/src/ui/patterns/ListGroupHeader.tsx` (label styles, always-visible actions), `web/src/lib/listGroups.ts` and `web/src/lib/views.ts` (Earlier, default collapse), `web/src/app/TaskListView.tsx` (lead meta, group actions, wide project lists), `web/src/app/TaskRow.tsx` and `lib/rowDetail` (due ladder), `web/src/app/review/DailyCheck.tsx`, `web/src/app/display/DisplayScreen.tsx`, `web/src/app/palette/registry.ts` (two commands), `web/src/app/bulk/*` (group batch), translations in `web/src/locales/*.json`.
- Server: `internal/mail/templates/digest.*.txt` and `internal/mail/digest.go` (the digest heading), goldens in `internal/mail/testdata`.
- Tests: `pageTemplate.test.ts`, `budget.test.tsx`, `listGroups.test.ts`, `groups.test.tsx`, `taskRow.test.tsx`, `rowDetail.test.tsx`, `closeDay.test.tsx`, `displayScreen.test.tsx`, `deadlineViews.test.tsx`, the frame step of `scripts/e2e-views.mjs`, `scripts/e2e-layout.mjs`, the Storybook baselines of Screens/Today, Upcoming, Project, Settings and the page header.
- Docs: `docs/interface-guide.md` (page template, group headers, the two frames), `docs/today-and-upcoming.md`, `docs/views.md`, `docs/method/rhythms.md`, `docs/review-and-statistics.md`, screenshots regenerated with `make docs-screenshots`.
- No new dependency; CSS and strings only; the main bundle changes by well under 1 KB gzipped.
