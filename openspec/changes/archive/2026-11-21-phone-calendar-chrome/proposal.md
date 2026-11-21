# Proposal

## Why

On a phone the calendar spends three rows before the first day: the bar with the period as its title, a row with Previous, Today and Next, and a row with the views Day, Week, Month, Plan and Year. At 360 px the first day starts 160 px down, and lower still when the bar has its second line ("1 block behind · Re-plan"). The interface budget allows two rows of chrome above a page's content (GitHub issue [#1361](https://github.com/OpenTodoApp/OpenTodo/issues/1361), found by the interface tour at 360 px). The audit never said so, because its rule counts rows only on list pages and the calendar is not one.

## What Changes

- **One row under the bar.** Below 768 px the calendar's row holds Previous, Today and Next at its start and the view at its end. The first day moves up by 50 px, from 160 to 110 px at 360 and 390 px.
- **The view is one button that names it.** In place of the five-part switch the row shows one button with the current view ("Week") and a chevron; it opens Day, Week, Month, Plan and Year as a menu with the current one checked. Choosing a view keeps the date, as before.
- **Calendars joins the page's menu.** Where the account has other calendars, the Calendars toggle is an item of the "…" menu on a phone, checked while their events show, next to Show completed tasks. It no longer adds a third group of controls to the row.
- **Same names, same keys.** Previous, Next and Today keep their accessible names and their shortcuts (`[`, `]`, `t`); the views keep `g d`, `g w`, `g m`, `g Shift+C` and `g y`. The period stays the bar's title, and "N blocks behind · Re-plan" stays its second line.
- **A project's Calendar layout** gets the same row, followed by its Calendar options button, under the project's own layout row.
- **Nothing changes from 768 px**: the header keeps the five-part switch and the Calendars button.

Out of scope: the bar itself and its second line, a swipe between periods, the Month's weekday row and the Plan's objectives strip (content, not chrome), a rule in the interface audit that measures the calendar's rows (see the design's open question), and the header from 768 px.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, not a squeezed desktop page).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `time-blocking`: a new requirement for the calendar's chrome on a phone, in every view of the Calendar destination and in a project's Calendar layout.

## Impact

- `web/src/app/CalendarRange.tsx`: the view switch is a menu button below 768 px.
- `web/src/app/calendar/CalendarsToggle.tsx` and the views (`CalendarView`, `MonthView`, `PlanView`, `YearView`): the Calendars toggle as a menu item below 768 px.
- No data, op, route or setting changes. No new string: "Calendar range", the view names and "Calendars" exist in every language. No dependency.
- The phone-width UI screenshots of Day, Week, Month, Plan, Year and a project's Calendar layout change.
