# Proposal

## Why

The Android and iPhone apps show the web app in a web view. After the audit of 2026-11-13 (`mobile/AUDIT.md`) and six rounds of phone changes, people who try them still say the same thing: fine, but a responsive version of the desktop app. Those rounds adapted screens designed for a desktop; none of them produced a screen designed for a phone.

This change tries the other way on the two screens a person uses most, Today and the task page: screens written only for a phone, in their own part of the web app, running on the same logic as the desktop screens. It is a trial behind a switch. Its purpose is one answer from the people who gave the feedback: does a dedicated phone screen in a web view read as an app?

The destination is decided: the phone UI is what the Android and iPhone apps show, and what the web app shows in any phone browser, in place of the responsive layout. The trial decides only whether to go there.

- If yes, the other screens follow, one change each, and the switch then turns on by default below 768 px, in the apps and in a phone browser alike.
- If no, the web view is the limit and the paused native app (`native-app-foundation`) is the remaining way. The screen designs carry over to it.

## What Changes

- **A switch, "New phone screens", off by default.** It is kept on the device and shown only below 768 px. Nothing changes for anyone who leaves it off, and nothing changes from 768 px up.
- **Today, for a phone.** A large title with the date that shrinks into the bar on scroll, today's calendar events, then the same groups in the same order as Today has now. A row is a 44 px check, the title at 16 px on up to two lines, and one quiet line of facts. A tap opens the task, a swipe right completes it, a swipe left schedules it.
- **The task page, for a phone.** Its own bar with Back, the next and previous task and the task's menu. Under the title, the task's facts are a plain list of rows, each opening a bottom sheet with the editor the desktop page uses. Notes, subtasks, custom fields, attachments, comments, activity, time and history stay. Nothing the task page shows today is lost.
- **A date sheet made for a phone.** The one editor that is new, because it is the one people open most: Today, Tomorrow, This weekend and Next week as rows, a month with days large enough for a thumb, a time row, the parts of the day, Clear. It opens from the task page and from the row's swipe to the left. Every other editor is the present one inside a sheet.
- **A screen transition.** Opening a task from Today slides the page in; going back slides it out. Reduced motion turns it off.
- **A place and a rule for phone screens.** `web/src/phone/`, loaded on demand. A phone screen never imports a desktop screen, and holds no logic of its own: both views run on one hook per feature. A test enforces the first; the second is checked in review until there are enough screens to justify a check.

Out of scope: every other screen (Inbox, Upcoming, projects, the calendar, Settings and the rest keep today's phone layout), the tab bar, the add button and quick add (kept as they are), tablets and every width from 768 px (the phone screens are written as panes so a tablet can show two side by side later, design D9), the native app in `mobile/app` (stays paused), any change in the Android or iOS shells, windowed lists, and new features of Today or the task page.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`). The web app in a phone browser gets the same screens with the switch on.

## Capabilities

### New Capabilities

- `phone-ui`: the screens written only for a phone: the switch that turns them on, Today, the task page and the transition between them.

### Modified Capabilities

None. With the switch on, `app-shell` "Phone navigation" and "Phone drawer" still hold: the tab bar and the add button are unchanged, Today's bar keeps the menu button that opens the drawer, and the task page keeps its own bar. `task-pages`, `today-agenda` and `today-closed-list` describe content and behaviour that both views share.

## Impact

- New: `web/src/phone/` (`prefs.ts`, `transition.ts`, `screens/PhoneToday.tsx`, `screens/PhoneTaskPage.tsx`, `components/`), with tests. The phone UI is built in Storybook: every component and screen there has a stories file, and `make ui-lint` fails on one without.
- `web/src/app/Shell.tsx` (choosing the phone screens, hiding its own phone bar on them), `web/src/app/PreferencesPanels.tsx` (the switch), `web/src/lib/habits.ts` (`stripHabits` moves here from `web/src/app/habits/TodayStrip.tsx`).
- Checks extended to the new directory: `web/src/layering.test.ts`, `web/eslint.config.js`, `scripts/ui-check.mjs`.
- One new string in eight languages. `docs/` gains a short page on the switch; `mobile/AUDIT.md` records the decision and, at the end, the verdict; `ROADMAP.md` gains a row.
- No op field, no route, no server change, no environment variable, no dependency. The phone screens are separate chunks loaded on demand (7.6 KB gzip together). The first load grows by 2.6 KB gzip, from the bundler splitting the modules they share with it into chunks of their own, and stays inside `web/bundle-budget.json` (660.0 of 712 KB); see design D2.
