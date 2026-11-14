# Design

## Context

Each calendar view (`CalendarView` for Day and Week, `MonthView`, `PlanView`, `YearView`) hands `CalendarPageHeader` its `actions`: the Calendars toggle (only with a subscribed calendar), a "Range" group with Previous, Today and Next, Show completed tasks (a button from 1280 px, a menu item below) and `CalendarRangeSwitch`, the five-part Day | Week | Month | Plan | Year control. Below 768 px (`DESKTOP_HEADER_QUERY`) `PageHeader` gives the title, the lead line and the overflow to the shell's `PhoneBar` and draws `actions` in the page as a wrapping row (`data-page-actions`). In a project's Calendar layout the same parts sit in the project header's second row, followed by the Calendar options menu.

Measured on the built app with the layout check's seed, Chromium with touch: at 360 px the range group is 145 px wide and the switch 222 px (five options of 44 to 46 px), so they wrap into two rows in a 328 px column and the content starts at y = 160 (bar 52 px, two rows of 44 px with their gaps). It is the same at 390 px. With a subscribed calendar the Calendars button is a third group.

The interface audit's rule for rows of chrome (M2, `chromeRows` in `scripts/ux-audit/audit-measures.mjs`) counts the children of `[data-list-page]` before the first task. The calendar pages are not list pages, so the rule never measured them; there is no written exemption.

## Goals / Non-Goals

**Goals:** one row under the bar on a phone, in every view and in a project's Calendar layout; Previous, Today and Next still one tap away; no new string; nothing different from 768 px.

**Non-Goals:** a new control in the design system; gestures; changing the bar.

## Decisions

### D1. The view becomes a menu button; Previous, Today and Next stay

Eight controls of 44 px need 352 px plus gaps and the column is 328 px, so one group has to fold. The three options:

- **The view as one button with its name, opening a menu (chosen).** The row is Previous, Today, Next (145 px) and "Week ⌄" (67 to 82 px) at the end: at most 227 px of 328 px in English. Measured at 360 px it stays one row in German, French ("Aujourd’hui" makes the group 177 px, "Semaine ⌄" 96 px) and Italian ("Settimana ⌄" 104 px), with room for larger text. The view changes a few times a day at most; moving in time is the frequent action and keeps all three buttons. It uses the overlay `Menu` with `kind="menu"` and radio items, the app's own way to choose one of a few on a phone (a bottom sheet titled "Calendar range").
- **Arrows at the ends of the five-part switch, Today by tapping the title.** Rejected: 88 + 222 + gaps is 318 px in English and over 328 px as soon as one view name is longer (French "Semaine" alone adds 14 px), and Today would hide behind a gesture nothing shows.
- **Arrows and Today in the bar.** Rejected: the bar's title is the period and would lose its room, the opposite of `phone-header-room`.

The cost is one more tap to change the view on a phone. The `g` shortcuts and the sidebar's remembered mode are unchanged.

### D2. One component decides, by the header's own breakpoint

`CalendarRangeSwitch` reads `useMediaQuery(DESKTOP_HEADER_QUERY)`: from 768 px the group of five pressed-state buttons, below it the menu button. That is the same condition under which `PageHeader` moves the actions out of its own row, so the row and its content always change together, and the four views and the project layout need no change for it. The button is a ghost button like Today, with `ml-auto` so it ends the row; its accessible name is "Calendar range" (visually hidden) followed by the view's name it shows, so the visible label is part of the name. The items are `menuitemradio` with the current view checked.

### D3. Calendars is a menu item on a phone

`CalendarsToggle` gets `menu`, as `CalendarCompletedToggle` has: the button renders from 768 px, the item below it, named "Calendars" and checked while the events show. Each view lists it first in its overflow. Without it an account with a subscribed calendar would get a second row back at 360 px (145 + about 110 + 82 px and gaps).

### Data model, size

No data model impact: no field, op, route or setting; the choice of view and the Calendars toggle are stored as before. No dependency. `Menu` and `MenuItem` are already in the first load; the calendar's chunk grows by a few hundred bytes.

### Interface budget

The calendar on a phone goes from three rows of chrome to two (the bar and one row); from 768 px it is unchanged. No new destination, scroll region, task property or shortcut; the existing shortcuts keep their keys.

## Risks / Trade-offs

- Changing the view takes two taps on a phone. The current view is always named in the row, and the menu is five items.
- The Calendars toggle is one tap further on a phone, in the menu where Show completed tasks already is.
- The row has no bottom padding (as before): the 44 px controls end on the header's hairline.

## Open Questions

- The audit's row rule could also measure the calendar (the rows between the bar and `[data-calendar-page]`'s content). Not added here: it is a new rule for the tour, with its own fixtures.
