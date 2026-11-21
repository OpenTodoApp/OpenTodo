# Proposal

## Why

`phone-header-room` moved Help out of the phone bar, and a project's name is still cut at 360 px: the bar holds the menu button, the title, Filter, Display options and the project menu, so "Home renovation with a rather long project name" reads "Home renovation wi…" in 152 px (GitHub issue [#1350](https://github.com/OpenTodoApp/OpenTodo/issues/1350)). While a duration filter is on it is worse: the chip with the filter's name is up to 140 px wide, which leaves a project's title 8 px and the Inbox's none. The Inbox already keeps the filter in its menu, because Process takes the slot. A project, Upcoming and Today do not need the button either.

## What Changes

- **The filter is in the menu on every phone list.** Below 768 px the duration filter's four choices are a group of the page's "…" menu on a project, Upcoming and Today, as they already are in the Inbox, and Upcoming's "Filter…" is an item there. The bar shows no Filter button. A choice is still two taps away: the menu, then the choice.
- **An active filter is one small chip in the bar.** While a duration filter is on, the bar shows a chip with the filter icon and a ×; a tap clears the filter. The menu shows which choice is on. The chip is 46 px wide, so the title keeps its room while a filter is on.
- **Nothing changes from 768 px**: the header keeps its Filter action and the chip with the filter's name.

Measured at 360 px: a project's title goes from 152 to 200 px, and with a filter on from 8 to 150 px; the Inbox's with a filter on from 0 to 40 px ("Inbox" fits).

Out of scope: Display options stays in the bar (see the design's open question); the Filter controls of saved views, the calendar and the audit log; the order of a project's menu; Help (`phone-header-room`); titles of other screens (`phone-titles-everywhere`); pressed states (`touch-pressed-states`).

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, not a squeezed desktop page).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: "Phone header actions" no longer gives the duration filter a slot in the bar, and says what the active filter's chip is.

## Impact

- `web/src/app/task-list/ListChrome.tsx` (`usePhoneListActions`): the filter is always an overflow item on a phone; the bar's chip is the compact one.
- No data, op, route or setting changes. No new string, no dependency.
- The phone-width UI screenshots of a project, Upcoming and Today without the assistant change (one control fewer in the bar, one group more in the menu), and those of any list with a filter on.
