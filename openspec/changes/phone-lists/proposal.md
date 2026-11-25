# Proposal

## Why

`phone-ui-trial` put two phone screens behind the "New phone screens" switch, Today and the task page. The owner tried them on a phone on 2026-11-25 and decided to go on: the phone UI is to carry every function of the web app and become what a phone shows. Today is the proof of what is missing. It lists and completes tasks, but it has no page menu, no selection, no reordering, no subtasks and no way to add in place, and every other list (Inbox, Upcoming, a project, a label) still opens in the old layout, so the app is half new and half old one tap from Today.

Ten routes are the same screen on the desktop, the task list. This change gives the phone UI that screen once, at parity: a person who turns the switch on loses nothing in any task list.

## What Changes

- **One phone list screen for every task list:** Inbox, Today, Upcoming, Anytime, Someday, Assigned to me, Completed, a label, a place and a project in its List layout. With the switch on below 768 px they all open in the phone UI. Today's present phone screen becomes this screen.
- **The page menu.** The bar's menu holds what the list's header offers today on a phone: display options (sort, group, subtasks, row layout), the duration and query filters with their chips, Select tasks, and each list's own items (Today's briefing, events, parts of the day, limit, Replan and Brief me; Upcoming's Start with Today, projections and events; the Inbox's and a label's menu; a project's menu and layout switch; Print).
- **Selecting tasks.** Select tasks turns the checks into tick boxes; the selection bar and its Actions menu are the present ones.
- **The row's menu and reordering.** A hold on a row opens the row's menu. A hold and a move drags the row where the list has a manual order; the menu's Reorder items do the same without a drag.
- **Subtasks and sections.** A tree list shows subtasks under their task, folded or open. A project's sections have their header, menu, add line and "n completed". Add task below, Add subtask and Edit open in the row, as they do now.
- **Each list's own parts.** The Inbox's Process button and sample tasks; Today's briefing, Close the day, Away, Log a win and time totals; Upcoming's events per day, summarised later days and projected occurrences; Completed's search, options and "show more"; a project's note and sub-projects; every empty state.
- **One model for both screens.** The wiring of the list (selection, order, drag, add, completion, row actions, header actions) moves out of `TaskListView` into one hook, `useListScreen`. The desktop list and the phone list both draw from it.

Out of scope, each a later change: a project's Board, Timeline and Calendar layouts (they keep the present screen; the layout switch still reaches them), the lists that are not this screen (a filter, a saved view, Next, Waiting, Trash, Triage, the reviews, Habits), the calendar, Notes, Settings and the rest, tablets and every width from 768 px, the switch's default (still off), the Android and iOS shells, and any new feature of a list.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `phone-ui`: gains the phone list screen and its parity with the task list. The capability's first requirements are in `phone-ui-trial`, not archived yet, so this change only adds requirements; where one widens what `phone-ui-trial` says of Today, it says so.

`task-lists` and the specs of each list's features (`bulk-edit`, `manual-ordering`, `today-closed-list`, `today-agenda`, `view-display` and the rest) describe behaviour both screens share; none changes.

## Impact

- New: `web/src/app/task-list/useListScreen.tsx` (the list's wiring), `ListHeader.tsx`, `ListMenu.tsx` and `rowHold.ts` (all moved from `TaskListView.tsx` and `TaskRow.tsx`); `web/src/phone/screens/PhoneList.tsx` and `PhoneListRow.tsx`, `web/src/phone/components/PhonePageHeader.tsx`, with stories and tests.
- Changed: `web/src/app/TaskListView.tsx` (draws from the hook; behaviour unchanged), `web/src/app/task-list/ListGroups.tsx` (the row renderer takes the row component), `web/src/ui/patterns/PageHeader.tsx` (a screen can give the header its drawing), `web/src/app/Shell.tsx` (the phone list for the ten routes), `web/src/phone/screens/PhoneToday*.tsx` and `PhoneGroup.tsx` (removed: replaced by the list screen), `web/src/index.css` (a group's rows as one card in the phone list), `web/eslint.config.js` (the allow-list), `scripts/ux-audit/layout-screens.mjs` and `.github/workflows/ci.yml` (the layout check with the switch on covers every list).
- No op field, no route, no server change, no environment variable, no dependency. The phone list is a chunk loaded on demand; the first load is measured against `web/bundle-budget.json` and reported in the design.
