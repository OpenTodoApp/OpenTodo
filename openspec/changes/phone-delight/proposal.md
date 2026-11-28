# Proposal

## Why

After `phone-modern-look` the owner said the phone UI "feels much more native and modern" and asked on 2026-11-28 for the next ten things from a UI and UX point of view, then to do all ten. Looking at the app at 390 px against what it already does narrowed each idea to what is missing:

- Completing a task already pops the check, strikes the title, folds the row and plays a haptic, and the briefing says "All done for today." What is missing is the moment: the Done today ring jumps to its new value and nothing marks the last completion.
- The Today tiles are three equal columns: at 390 px Up next squeezes its title into two lines of a third of the width, and the owner found them too basic (2026-11-28): small for what they hold, compressed, not modern.
- Opening a task slides its page in; nothing ties the row that was tapped to the page that opens.
- A hold on a row opens the actions as a sheet headed "1 task": the person cannot see which task they are acting on.
- Upcoming's week strip only scrolls; a task cannot be put on one of its days.
- Quick add on a phone has a dashed chip for a project and a label, but a date, the field people set most, takes the calendar tool and a second tap.
- The tab bar gives no count; the drawer has to be opened to see how many tasks wait in the Inbox and Today.
- An empty list on a phone shows the desktop's empty state, small and high up in the screen.
- A project's screen looks like every other list: the light at the top is the accent everywhere, and once the Today tiles scroll away the day's progress is gone.

The tenth idea, completing a task from the home-screen widget, is native and goes in its own change (`ios-widget-complete`; Android's widgets already do it).

## What Changes

Below 768 px only, in the phone UI:

- **The day closes.** The Done today ring moves to its new value, and the last completion of the day plays the success haptic once.
- **Today's cards, redone.** A bento in place of three tiles: Up next across the width (its time large, how soon, the title), Done today and Late under it, each named in small capitals above a large figure; the ring has a gradient.
- **The task grows into its page.** On a push the tapped row's title moves into the page's title while the page slides in; Back moves it back to its row.
- **A hold shows the task.** The actions sheet for one task is headed by the task as its row draws it (check ring colour, title, facts) instead of "1 task".
- **Drop on a day.** While a task is dragged in Upcoming, each day of the week strip takes it, as the day's group in the list does.
- **Dates in one tap.** Quick add's sheet shows Today, Tomorrow and Next week as dashed chips while the line has no date; a tap sets that date in the line.
- **Counts on the tabs.** Inbox and Today show their open counts on the tab icon, the numbers the drawer shows. A hold on the Today tab opens the day's next timed task; a hold on the Inbox tab opens the Inbox with quick add.
- **Empty lists, centred.** On a phone an empty list's illustration and words sit in the middle of the free space, larger, over the light.
- **The header follows the screen.** On a project the light takes the project's colour. On Today, once the title moves into the bar, the bar shows the day's progress as a small ring and count next to the title.

Out of scope: the desktop and every width from 768 px, the native widgets (own change), new data, new ops, new settings. One new string, "in {time}", in every catalogue. Pull to sync was among the ten ideas; it exists already (`pull-to-sync`), so it is not part of this change.

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: "Phone navigation": the tab counts and the tab holds.
- `phone-ui`: gains the day closing, Today's cards, the shared title, the task in the actions sheet, the week strip as a drop target, the date chips in quick add, centred empty lists and the header following the screen.

## Impact

Web only: `web/src/phone/**`, `web/src/app/TabBar.tsx`, `web/src/app/quickadd/SheetBar.tsx`, `web/src/app/bulk/BulkActions.tsx` (the sheet's head), `web/src/index.css`, catalogues. No server change, no op, no env var, no dependency. The first-load budget is unchanged in kind: the tab counts reuse the drawer's count functions.
