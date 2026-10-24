# Proposal

## Why

This is the last screen-level part of the "Precision" redesign (the round-2 mock-ups `phone-today`, `phone-task` and `phone-quickadd`). The desktop parts have landed: tokens, the shell, one-line rows, the task page, the briefing, quick add. The phone still has the earlier look, which differs from the mock-ups in four ways:

- **The day talks only on a desktop.** Below 768 px the shell's bar takes a day page's title, so Today's briefing (`briefing`) is not shown on a phone, the device people check their day on.
- **Rows are two lines.** Under 40 rem a row puts every property in a metadata line under the title, so a phone shows about half as many tasks as the mock-up, where each row is one line with one property at its end.
- **The tab bar repeats the menu.** It has five tabs, and More opens the same drawer the bar's menu button opens. The current tab is emerald, while Precision keeps colour for state and marks the current page in a neutral tone.
- **The task page's facts are a desktop column squeezed under the notes.** On a phone they are four headed groups of narrow rows, every unset fact included. The mock-up shows one card of full-width rows with the facts that matter.

## What Changes

- **Phone top bar and the day head:**
  - On Today and Upcoming the bar holds only the menu button and the page's actions, with no hairline.
  - The title at the display step, the date line and the briefing are in the page, under the bar, and scroll with the list.
  - Other pages keep the title in the bar.
  - A page with Back (the task page, a nested page) shows Back in the menu button's place.
- **Phone rows:**
  - Below 768 px a list row narrower than 40 rem is one 44 px line with the title at 14.5 px.
  - The line keeps one cell at its end: the date, else the deadline, else the assignee's avatar, else the project's dot.
  - The time sits before the title only on rows that have one, and the counts leave the line.
  - The task page shows the rest.
- **Bottom tab bar:**
  - The tabs are Inbox, Today, Upcoming and Search, with Today as a sun.
  - More is gone, since the bar's menu button opens the drawer.
  - The current tab is in the strong text tone, not the accent.
  - The floating add button stays.
- **Stacked facts on the task page:**
  - Below 768 px the facts are one card of 44 px rows: the icon and the fact's name on the left, the value or action on the right.
  - The card shows the facts with a value, the date and the deadline even when unset, and priority only above 4.
  - "More properties" shows the rest in place.

Out of scope:
- The quick-add sheet (`palette-quick-add` built it).
- The Inbox's split view (`inbox-split`).
- Tablets from 768 px, which keep the desktop shell.
- Native shells: they load the same web app and get this with it.

No ROADMAP.md item: this is part of the Precision redesign in the design references, not a roadmap feature. No new environment variable, no op-log change.

## Capabilities

### Modified Capabilities

- `app-shell`:
  - "Page template": the day head stays in the page on a phone;
  - "No desktop top bar": the phone bar without a title on day pages, and Back in the menu's place;
  - "Phone navigation": four tabs and the neutral current tab;
  - "Phone drawer": opened from the bar's menu button.
- `task-list-presentation`:
  - "One row anatomy": the phone row of one line and one cell;
  - "Time column": below 768 px only rows with a time show it, before the title;
  - "Phone header actions": the day head above Today's list.
- `web-app`: "Task facts column": the stacked card below 768 px.

## Impact

- **Code:**
  - `web/src/app/Shell.tsx` (the phone bar);
  - `web/src/ui/patterns/PageHeader.tsx` and `pageBar.ts` (the phone day head);
  - `web/src/app/TabBar.tsx`;
  - `web/src/app/TaskRow.tsx` and `web/src/index.css` (the phone row);
  - `web/src/app/task-detail/TaskFacts.tsx` and `TaskPageView.tsx` (the stacked facts);
  - one new string in the five catalogs.
- **Visual baselines:** the phone stories change, and there is a new "Today" phone story.
- **Docs:** `docs/` guides for the phone and the task page, and the CHANGELOG.
