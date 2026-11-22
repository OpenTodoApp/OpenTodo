# Design

## Context

Below 768 px (`DESKTOP_HEADER_QUERY`) a list builds its bar with `usePhoneListActions` (`web/src/app/task-list/ListChrome.tsx`): `slots` for the bar and `items` for the page's menu (`PhoneMenuItems` in the Inbox menu and the overflow menu, `phoneGroups` in the project and label menus). The duration filter took a slot unless Process (Inbox) or Ask (Today with the assistant) had it; then its choices were a "Filter by duration" group of the menu and the active one a named chip in the bar. So the way to show the filter in the menu exists, and the Inbox uses it.

Measured at 360 px on the seeded account, before: the title has 152 px on a project (bar: menu button, title, Filter, Display options, project menu) and 90 px in the Inbox (Process 3, Display options, Inbox menu). The named chip is 140 px wide for "Unestimated"; with it a project's title has 8 px and the Inbox's 0.

## Goals / Non-Goals

**Goals:** the Filter button out of the phone bar; the active filter visible without opening the menu and without costing the title its room; no new mechanism, no new string.

**Non-Goals:** moving Display options; a bar that collapses by width; any change from 768 px.

## Decisions

### D1. The filter is always an overflow item on a phone

`usePhoneListActions` drops the `filterSlot` case: the duration choices and Upcoming's "Filter…" are always `items`. Every list with a duration filter has a menu on a phone (the Inbox menu, the project menu, the overflow of Today and Upcoming), so nothing is lost.

The choices stay a flat group of check items, not one "Filter" item that opens a second sheet: a choice is two taps (the menu, the choice), as it was with the button, and the menu shows the active choice checked. The arrow keys, End and type-ahead reach the items like any other; choosing closes the menu and focus returns to its button. "Filter…" opens Upcoming's dialog, which returns focus to the menu's button when it closes.

Alternative: hand a Filter item to the menu through `MenuTailContext`, as Help is. Rejected: the list already hands its items to its menu (`PhoneItem`), and the Inbox has shown the filter this way since `phone-v2`; a second path for the same items would be the more complicated one. `MenuTailContext` stays for what the shell adds to every page's menu.

### D2. The active filter is a compact chip that clears it

On a phone the chip is `PhoneDurationChip`: one button, 46 × 44 px, a pill in the accent-soft tokens with the filter icon and a ×, named "Clear filter", with the filter's name before it for screen readers. The header from 768 px keeps the named chip.

Alternative: keep the named chip. Rejected: it is wider than the button it replaces, so the title would lose its room exactly when a filter is on. Alternative: a dot on the "…" button named "More, filter active". Rejected: a new string in eight languages, a change to every page menu's trigger, and clearing would take two taps.

Upcoming's query chip keeps its text: Upcoming is a day page, its bar has no title to protect.

### Data model, size

No data model impact: no field, op, route or setting; the filter stays a per-device choice in local storage. No dependency. The first load stays inside the budget (entry chunk 144.7 KB gzip of 146 KB).

### Interface budget

The phone bar of a project, Upcoming and Today loses one control; nothing is added above a list (two rows of chrome: the bar and the quick add). No new destination, scroll region, task property or shortcut; the duration filter has no shortcut.

## Risks / Trade-offs

- The filter shows in the bar only once one is on. It is in the same menu, under the same heading, on every phone list, as the Inbox already had it.
- The compact chip does not name the filter. The menu does, and the name is announced to screen readers.
- A project's menu on a phone is long (colours, Layout, the filter, then the project's own items). It scrolls as a sheet; reordering it is out of scope.

## Open Questions

- "Home renovation with a rather long project name" is still cut at 360 px in 200 px ("Home renovation with a rat…"); a name of about 24 characters fits. Display options is the last candidate (48 px more), but it is a panel with form controls opened from its own button, so moving it needs a menu item that opens a panel and returns focus. Not done here.
