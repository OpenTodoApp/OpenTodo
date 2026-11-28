# Proposal

## Why

After `phone-modern-look` the owner said the phone UI "feels much more native and modern" and asked on 2026-11-28 for the next ten things from a UI and UX point of view, then to do all ten. Looking at the app at 390 px against what it already does narrowed each idea to what is missing:

- Completing a task already pops the check, strikes the title, folds the row and plays a haptic. What is missing is the day: the Done today ring jumps to its new value, and clearing Today shows "Nothing due today", the same words as a day that never had anything.
- Opening a task slides its page in; nothing ties the row that was tapped to the page that opens.
- A phone gives no way to ask for a sync and no sign of it outside the drawer.
- A hold on a row opens the actions as a sheet headed "1 task": the person cannot see which task they are acting on.
- Upcoming's week strip only scrolls; a task cannot be put on one of its days.
- Quick add on a phone has a dashed chip for a project and a label, but a date, the field people set most, takes the calendar tool and a second tap.
- The tab bar gives no count; the drawer has to be opened to see how many tasks wait in the Inbox and Today.
- An empty list on a phone shows the desktop's empty state, small and high up in the screen.
- A project's screen looks like every other list: the light at the top is the accent everywhere, and once the Today tiles scroll away the day's progress is gone.

The tenth idea, completing a task from the home-screen widget, is native and goes in its own change (`ios-widget-complete`; Android's widgets already do it).

## What Changes

Below 768 px only, in the phone UI:

- **The day closes.** The Done today ring moves to its new value. When the last open task of Today is completed and at least one was completed today, Today says "All done for today" with the count, and the phone plays the success haptic once.
- **The task grows into its page.** On a push the tapped row's title moves into the page's title while the page slides in; Back moves it back to its row.
- **Pull down to sync.** At the top of a phone list, pulling down past a threshold asks for a sync now; a line under the header shows Syncing, Synced, Offline or the sync's own words, and a tick plays at the threshold.
- **A hold shows the task.** The actions sheet for one task is headed by the task as its row draws it (check ring colour, title, facts) instead of "1 task".
- **Drop on a day.** While a task is dragged in Upcoming, each day of the week strip takes it, as the day's group in the list does.
- **Dates in one tap.** Quick add's sheet shows Today, Tomorrow and Next week as dashed chips while the line has no date; a tap sets that date in the line.
- **Counts on the tabs.** Inbox and Today show their open counts on the tab icon, the numbers the drawer shows. A hold on the Today tab opens the day's next timed task; a hold on the Inbox tab opens the Inbox with quick add.
- **Empty lists, centred.** On a phone an empty list's illustration and words sit in the middle of the free space, larger, over the light.
- **The header follows the screen.** On a project the light takes the project's colour. On Today, once the title moves into the bar, the bar shows the day's progress as a small ring and count next to the title.

Out of scope: the desktop and every width from 768 px, the native widgets (own change), new data, new ops, new settings. New strings: "All done for today", "Next week" (exists), "Pull to sync", "Release to sync" and the count names, in every catalogue.

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: "Phone navigation": the tab counts and the tab holds.
- `phone-ui`: gains the day closing, the shared title, pull to sync, the task in the actions sheet, the week strip as a drop target, the date chips in quick add, centred empty lists and the header following the screen.

## Impact

Web only: `web/src/phone/**`, `web/src/app/TabBar.tsx`, `web/src/app/quickadd/SheetBar.tsx`, `web/src/app/bulk/BulkActions.tsx` (the sheet's head), `web/src/index.css`, catalogues. No server change, no op, no env var, no dependency. The first-load budget is unchanged in kind: the tab counts reuse the drawer's count functions.
