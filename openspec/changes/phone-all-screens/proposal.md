# Proposal

## Why

With `phone-ui-trial` and `phone-lists` the phone UI holds the task lists and the task page. Every other screen (Labels, Views, Projects, the calendar, Notes, Statistics, Habits, the reviews, Next, Waiting, a filter, a saved view, Trash, Settings, Help) is still the old layout under the shell's old bar, so a person with the switch on moves between two interfaces: one tap from a phone list is a page with a different bar, a different title and a different row. The owner's goal is the whole web app in the phone UI.

Those screens are built from the same two parts as the lists, a page header (`PageHeader`) and the task row (`TaskRow`), and `phone-lists` already made both drawable by the phone UI. Giving them to every screen at once removes the seam: one bar, one title, one row everywhere. What a screen has beyond those two parts (a calendar's grid, a board's columns, a note's editor, a settings form) is not redrawn here; it sits under the phone header and is taken on screen by screen afterwards.

## What Changes

- **Every screen has the phone header.** With the switch on below 768 px, a page's header is the phone's: the bar with the menu button (or Back on a nested page), the page's own controls and menu, then the title large with its lead line, moving into the bar on scroll. The shell's own phone bar is no longer shown on any screen that has a page header.
- **Every task row is the phone row.** Wherever a screen lists tasks with the app's task row (a filter, a saved view and a dashboard, Next, Waiting, the Open Loops home, the reviews, the plan), the row is the phone row: the check, the title on two lines, one line of facts, a tap that opens the task page, the swipes and the hold menu where the list has them.
- **One canvas.** Every screen sits on the phone UI's background with the same side gutter, and group headings lose their filled bar, as in the lists.
- **The checks reach every screen.** The layout and accessibility check with the switch on runs over the whole screen inventory, not the lists alone.

Out of scope, each a later change: redesigning what is specific to a screen (the calendar's day, week and month, a project's board, timeline and calendar, the notes editor, the settings forms, Statistics' charts, Focus), the tab bar and the add button, the sign-in and public pages (they are outside the shell), tablets and every width from 768 px, the switch's default (still off), and the Android and iOS shells.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `phone-ui`: gains the phone header and the phone row on every screen. The capability's earlier requirements are in `phone-ui-trial` and `phone-lists`, not archived yet, so this change only adds requirements.

No screen's own capability changes: each keeps its content and behaviour.

## Impact

- New: `web/src/phone/PhoneChrome.tsx` (the phone header and group headings around the shell's screens), `web/src/phone/screens/PhoneTaskRow.tsx` (the phone row on the task row's props), tests and stories.
- Changed: `web/src/app/Shell.tsx` (the screens inside `PhoneChrome` while the phone UI is on), `web/src/app/TaskRow.tsx` (the row can be drawn by a screen), `web/src/ui/patterns/PageHeader.tsx` (a header inside a page stays the page's own), `web/src/phone/components/PhonePageHeader.tsx` (Back, the own-bar signal, the gutter), `web/src/phone/screens/PhoneList.tsx` and `PhoneListRow.tsx` (they use the shared parts), `scripts/e2e-layout.mjs` and `.github/workflows/ci.yml` (the phone UI run over every screen).
- No op field, no route, no server change, no environment variable, no dependency. `PhoneChrome` joins the first load only as a boundary; the size is measured against `web/bundle-budget.json` and reported in the design.
