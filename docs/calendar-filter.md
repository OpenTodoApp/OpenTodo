---
title: Filter the calendar
summary: Show only the tasks a query matches in the calendar and in Upcoming, and show one project as a calendar.
audience: user
section: Guides
specs: [filter-queries, time-blocking]
order: 64
---
# Filter the calendar

<picture><source srcset="images/plan-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/plan-light.webp" alt="The Plan: fourteen days as two rows of seven columns, each with a capacity bar and its tasks."></picture>

When the week is full of everything, narrow it down: to one project, a few labels, the urgent work.

## Filter the calendar and Upcoming

**Filter…** shows only the tasks a query matches, in the [filter language](filters.md) of saved views: `##Work` for a project and its sub-projects, `p1`, `@errand | @call`. The label checkboxes under the query write `@label` terms for you. Every change applies at once; a query with a mistake shows the error and keeps the last one that worked.

- In the [calendar](calendar-views.md), **Filter…** is in the **More actions** menu. One filter covers Day, Week, Month, Plan and Year. It narrows tasks and their [deadline](deadlines-and-start-dates.md#deadlines) markers; calendar events, frames and the planning list are never filtered. Capacity still counts every task of the day, and its tooltip says how many are hidden by the filter.
- In [Upcoming](today-and-upcoming.md), **Filter…** is under the duration choices of the header's **Filter** button. Upcoming has a filter of its own.
- An active filter is one chip in the header, in words (*Project is Work or a sub-project*): click it to change the filter, or its **×** to clear it.

Each filter is remembered on this device across reloads and is never synced. It works offline, from the tasks on your device.

## A project as a calendar

At the top of a project, the layout switch has **Calendar** after **Timeline** (<kbd>v</kbd> cycles **List**, **Board**, **Timeline**, **Calendar**). The project page then shows the calendar in the mode you used last, with only the tasks of the project and its sub-projects, and your other calendars' events as usual. The range buttons and **Day**, **Week**, **Month** and **Plan** sit in the project's header; the calendar's options are under the sliders button next to them, and **Plan from a list** opens on the project. The calendar filter applies here too. On a phone the project's Week is the day-by-day list and its Month shows counts, as in the Calendar.
