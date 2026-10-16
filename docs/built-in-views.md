---
title: The built-in views
summary: What Inbox, Today, Upcoming, Anytime, Someday, Assigned to me, Calendar, Completed, Filter, Trash and Updates show, their shortcuts, and the duration filter.
audience: user
section: Guides
specs: [web-app]
screens: [inbox#what-each-view-shows, completed#what-each-view-shows, assigned#what-each-view-shows, anytime#anytime-for-when-you-have-time, someday#park-ideas-in-someday]
order: 21
---
# The built-in views

<picture><source srcset="images/sidebar-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/sidebar-light.webp" alt="The sidebar with the built-in views at the top, counts next to Inbox, Today, Assigned to me and Trash, then the Views, Projects and Labels groups."></picture>

These are the views OpenTodo comes with. Each is built from the copy of your tasks on your device, so it works offline and updates the moment something changes. Today and Upcoming have [a page of their own](today-and-upcoming.md); for views you make yourself, see [Saved views](saved-views.md).

## What each view shows

They're at the top of the sidebar. Each has a shortcut: press <kbd>g</kbd>, then the letter.

| View | Shows | Shortcut |
| --- | --- | --- |
| **Inbox** | Tasks that aren't in a project yet | <kbd>g</kbd> <kbd>i</kbd> |
| **Today** | Tasks due today and tasks whose deadline is today, with overdue ones first | <kbd>g</kbd> <kbd>t</kbd> |
| **Upcoming** | Tasks due after today, and undated tasks with a deadline ahead, grouped by day | <kbd>g</kbd> <kbd>u</kbd> |
| **Anytime** | Open tasks with no date and no start: things to do whenever there is time | <kbd>g</kbd> <kbd>n</kbd> |
| **Someday** | Tasks you parked for later, by project | <kbd>g</kbd> <kbd>o</kbd> |
| **Assigned to me** | Open tasks assigned to you, across projects | <kbd>g</kbd> <kbd>a</kbd> |
| **Calendar** | Your dated tasks by Day, Week or Month, as you last left it | <kbd>g</kbd> <kbd>d</kbd>, <kbd>g</kbd> <kbd>w</kbd>, <kbd>g</kbd> <kbd>m</kbd> |
| **Completed** | What you finished most recently | <kbd>g</kbd> <kbd>c</kbd> |
| **Filter** | Any search you can describe | <kbd>g</kbd> <kbd>f</kbd> |
| **Trash** | Deleted tasks and projects | <kbd>g</kbd> <kbd>x</kbd> |
| **Updates** | What changed in your shared projects | <kbd>g</kbd> <kbd>h</kbd> |

The sidebar keeps Inbox, Today, Upcoming and Calendar at the top; the rest wait in **More** (open it once, it stays open on this device). The numbers next to Inbox, Today and the projects count open tasks. Deferred and parked tasks (see [When a task starts](tasks-and-projects.md#when-a-task-starts)) are not counted.

Each project can also be shown three ways: as a **List**, as a **Board** with a column per section, or as a **Timeline** of its dates with arrows between tasks that wait for each other. Press <kbd>v</kbd> to cycle through them; see [Sections and boards](sections-and-boards.md).

## Anytime, for when you have time

Anytime lists every open task that has no due date, no deadline and no start date, grouped by project: the things you could do whenever there is a moment. A task leaves it as soon as it gets a date, from any device.

## Park ideas in Someday

Someday holds the tasks you parked: ideas and maybes you don't want to see every day. They stay out of Today, Upcoming, Anytime and the counts, and are listed here by project and in their project's **Later** group. Anything you add in this view is parked. Press <kbd>n</kbd> on a task to park it or bring it back.

## Narrow a list by duration

The **Filter** action in the header of the Inbox, Today, Upcoming and project lists offers **Quick wins** (15 minutes or less), **Under 30 min**, **Over 1 h** and **Unestimated**. Turn one on to see only matching tasks; a chip with its name appears in the header, and its × clears the filter. Your choice is remembered on that device. Estimates are set with <kbd>e</kbd> or in the task panel.
