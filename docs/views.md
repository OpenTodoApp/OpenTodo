---
title: Views
summary: Inbox, Today, Upcoming, Assigned to me, Completed and the calendar, plus views you save yourself, dashboards and the view each device opens on.
audience: user
section: Guides
specs: [web-app, custom-views]
screens: [inbox/triage#process-the-inbox, settings/start-view#choose-where-the-app-opens, someday#park-ideas-in-someday, anytime#anytime-for-when-you-have-time, inbox#the-built-in-views, today#plan-your-day-with-today, upcoming#plan-your-week-with-upcoming, completed#the-built-in-views, assigned#the-built-in-views, filters#save-your-own-views, saved-filter#save-your-own-views, dashboard#build-a-dashboard]
order: 20
card: upcoming
---
# Views

A view is a way of looking at your tasks. OpenTodo comes with a handful, and you can save your own. Every view is built from the copy of your tasks on your device, so they all work offline and update the moment something changes.

## The built-in views

They're at the top of the sidebar. Each has a shortcut: press <kbd>g</kbd>, then the letter.

| View | Shows | Shortcut |
| --- | --- | --- |
| **Inbox** | Tasks that aren't in a project yet; **Process** walks them one at a time | <kbd>g</kbd> <kbd>i</kbd>, <kbd>g</kbd> <kbd>p</kbd> to process |
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

Each project can also be shown three ways: as a **List**, as a **Board** with a column per section, or as a **Timeline** of its dates with arrows between tasks that wait for each other. Press <kbd>v</kbd> to cycle through them; see [Sections and boards](sections-and-boards.md#see-a-project-on-a-timeline).

## Process the Inbox

Capture first, decide later. When the Inbox has piled up, select **Process** in its header (or press <kbd>g</kbd> <kbd>p</kbd>) and decide each task in turn, keyboard only if you like. One task is shown at a time with its notes, date and labels, and "4 of 17" tells you how far you are.

<picture><source srcset="images/triage-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/triage-light.webp" alt="Process the Inbox: one task card, Renew passport, with buttons for Today, Schedule, Move, Delegate, Labels, Someday, Complete, Trash, Skip and Back, each with its key."></picture>

| Key | Decision |
| --- | --- |
| <kbd>t</kbd> | Due today |
| <kbd>s</kbd> | Schedule: type a date (`fri`, `3/11`) and press <kbd>Enter</kbd> |
| <kbd>m</kbd> | Move to a project |
| <kbd>a</kbd> | Delegate: move it into a shared project and assign it to someone there, in one step |
| <kbd>l</kbd> | Labels. This one doesn't move on, so you can add a label and then decide |
| <kbd>y</kbd> | Park it in [Someday](#park-ideas-in-someday) |
| <kbd>c</kbd> | Complete |
| <kbd>Delete</kbd> | Move to the Trash |
| <kbd>j</kbd> or <kbd>Space</kbd> | Skip it for now |
| <kbd>k</kbd> | Back to the previous task |
| <kbd>Enter</kbd> | Open the task's panel to edit anything else; <kbd>Esc</kbd> comes back |

Every decision moves on to the next task and shows **Undo** for a few seconds. <kbd>Esc</kbd> returns to the Inbox with the task you were on selected. Tasks captured meanwhile, on any device, join the end; a task someone moves out of the Inbox elsewhere drops out. Delegating needs a project you share with someone. It all works offline, and with Vim keybindings on, <kbd>x</kbd>, <kbd>dd</kbd>, `:triage` and `:q` work too.

## Plan your day with Today

Today is where most people start. Overdue tasks sit in their own group at the top, in red, so nothing slips. Below them are today's tasks, sorted by time.

A [deadline](tasks-and-projects.md#deadlines) brings a task into Today too: a task whose deadline is today shows up even if it has no due date or is planned for later. If the deadline has already passed and the task isn't planned for today, it sits under **Overdue**. Each task is listed once, and the Today count in the sidebar counts the same tasks.

A task whose start date has come shows up in Today too, with a **Started** chip, and stays until you complete it, give it a date or defer it again. Deferred and parked tasks stay out of Today, unless their due date or deadline has come: a hard date always wins. Tasks you marked for **This Evening** are listed in their own group below the day's tasks.

Tasks [waiting for another task](tasks-and-projects.md#wait-for-another-task) gather in a **Blocked** group at the end, folded so they don't crowd the day; select the heading to open it (your choice is kept on this device). When the task they wait for is completed, they move up among today's tasks by themselves. In Upcoming and other lists, blocked tasks stay in place, dimmed, with a lock.

<picture><source srcset="images/today-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/today-light.webp" alt="The Today view with an Overdue group above today's tasks."></picture>

Anything you add here with quick add is due today, unless you type another date. To push a task to later, open it and change **Due**, or press <kbd>s</kbd> to place it on the Day calendar.

## Plan your week with Upcoming

Upcoming lists everything that has a date after today, under headings like **Tomorrow** and the weekday names. It's a good place for a short weekly review: scan the next few days, move what won't fit, and spot empty days.

A task with a deadline but no due date is listed under its deadline day, after the tasks due that day, so you see it while there is still time to plan it. A task with both dates is listed under its due date only; its row shows the deadline countdown. Deferred and parked tasks are left out until they start.

## Anytime, for when you have time

Anytime lists every open task that has no due date, no deadline and no start date, grouped by project: the things you could do whenever there is a moment. A task leaves it as soon as it gets a date, from any device.

## Park ideas in Someday

Someday holds the tasks you parked: ideas and maybes you don't want to see every day. They stay out of Today, Upcoming, Anytime and the counts, and are listed here by project and in their project's **Later** group. Anything you add in this view is parked. Press <kbd>n</kbd> on a task to park it or bring it back.

<picture><source srcset="images/upcoming-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/upcoming-light.webp" alt="The Upcoming view with tasks grouped under Tomorrow and the following weekdays."></picture>

When you want to see the hours, switch to **Week**, which shows your timed tasks as blocks on a grid. See [Time blocking](time-blocking.md).

## Narrow a list by duration

The **Filter** action in the header of the Inbox, Today, Upcoming and project lists offers **Quick wins** (15 minutes or less), **Under 30 min**, **Over 1 h** and **Unestimated**. Turn one on to see only matching tasks; a chip with its name appears in the header, and its × clears the filter. Your choice is remembered on that device. Estimates are set with <kbd>e</kbd> or in the task panel.

## Save your own views

When the built-in views aren't enough, describe what you want in the **Filter** view, then save it. For example, `blocked` lists every task waiting for another one (save it as **Waiting for**), `@waiting & open` lists everything you labelled as waiting, and `due <= 7 days & p1` shows urgent tasks for the coming week. The filter language is explained in [Labels and filters](labels-and-filters.md).

To save the current filter, press <kbd>s</kbd> in the results (or use the save button), and give it a name. Saved filters are pinned to the **Views** group in the sidebar with a live count, and they sync to all your devices.

Each saved view can group its tasks (by project, date, priority or label) and sort them (by date, priority, your own order, creation time or title). Change these from the top of the view. To change the query itself, press <kbd>/</kbd>, edit it and press <kbd>Enter</kbd>.

The **All** link next to **Filters** (or <kbd>g</kbd> <kbd>v</kbd>) opens the list of all your saved filters and boards. From there you can rename, reorder, unpin or delete them.

Every saved view has the same menu, wherever you open it: the **⋯** button on its row in the sidebar or the views list, its header, or a dashboard. With a row focused, <kbd>.</kbd> (or <kbd>Shift</kbd>+<kbd>F10</kbd>) opens it too.

- **Rename**.
- **Pinned to sidebar** and **Start view on this device**: a check mark shows which apply.
- **Move up** and **Move down**: unavailable at the top or bottom of the list, with the reason shown.
- **Delete view…** asks for confirmation first. Deleting a view never touches your tasks.

<picture><source srcset="images/view-menu-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/view-menu-light.webp" alt="The menu of a saved view: Rename, the Pinned to sidebar and Start view on this device check items, Move up and Move down, and Delete view at the bottom."></picture>

## Build a dashboard

A dashboard puts up to six saved views side by side, each showing its count and first ten tasks. It's handy for a morning review: "Due this week", "Deep work" and "Waiting on others" on one screen.

<picture><source srcset="images/dashboard-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/dashboard-light.webp" alt="The Weekly review dashboard with three panels: Due this week, Deep work and Waiting on others."></picture>

Open the views list (<kbd>g</kbd> <kbd>v</kbd>), choose **+ New dashboard**, name it, then add saved views as panels from the dashboard's header. On a phone the panels stack. Move between panels with <kbd>Tab</kbd>, and through a panel's tasks with <kbd>j</kbd> / <kbd>k</kbd>.

## Choose where the app opens

Each device can open on a different view: your laptop on a "Work" view, your phone on Today. Pick it in **Settings → Preferences → Start view**, or from a saved view's menu with **Start view on this device**. If that view is deleted later, the device opens on the Inbox and tells you why.

## Tips

- Subtasks show up on their own in Today and Upcoming, with their parent's name next to them, so you see exactly what's due.
- Views that sort by date (Today, Upcoming, labels, filters) can't be reordered by hand. Projects and the Inbox can.
- [Filter queries](filters.md) has ten ready-made examples to copy.
