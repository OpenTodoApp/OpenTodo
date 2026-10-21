---
title: Statistics and the weekly digest
summary: A dashboard of what you completed, when, and where your time went, all computed on your device, and an optional weekly digest by email on your review day.
audience: user
section: Guides
specs: [statistics, email-digest]
screens: [stats#statistics, settings/digest#weekly-digest-by-email]
order: 25
---
# Statistics and the weekly digest

<picture><source srcset="images/stats-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/stats-light.webp" alt="The Statistics dashboard for this week: the period chooser, four tiles (done, on time, streak, tracked) with their change against last week, a line chart of completed and created tasks, time per project as bars, and a year of done tasks as a grid of shaded days."></picture>

## Statistics

Open **Statistics** under More, or press <kbd>g</kbd> <kbd>Shift+S</kbd>. Choose this week, this month, this quarter, this year or last week with the arrow keys. Weeks start on your [first day of the week](dates-and-times.md), and days begin at your [day start](dates-and-times.md#when-a-day-ends): with 04:00, a task completed at 01:30 counts for the day before. A period to date is compared with the same days of the previous one: on 10 October, this month is 1–10 October against 1–10 September.

The four tiles:

- **Done**: tasks and subtasks completed. Each day of a recurring task counts once; a skipped habit day never counts.
- **On time**: of the completions whose task had a due date, the share done on or before that day.
- **Streak**: days in a row with a completion, up to today (or yesterday while today has none yet), and your best run in the last 53 weeks.
- **Tracked**: your own [time entries](time-tracking.md) that started in the period, against the estimates of the tasks they were tracked on, and how many of those tasks have no estimate.

Each panel answers one question:

- **Am I keeping up?** Completed and created as two lines: per day up to a month, per week for a quarter, per month for a year.
- **Where does my time go?** Tracked time per project (the top five, then "other"; Inbox for tasks without a project), or completions per project when nothing was tracked.
- **A year of done tasks**: every day of the last 53 weeks, shaded by how much you completed, whatever the period.
- **When do I get things done?** Completions by weekday and hour, the hours starting at your day start.
- **How good are my estimates?** For tasks with an estimate and at least 5 minutes tracked: how many times their estimate they take, and the projects or labels furthest from it.
- **What keeps slipping?** Open tasks whose due date was moved later or removed three times or more in 90 days. It reads this device's history, so another device may list different tasks.

Every chart has **Show as table**, and with the keyboard the arrow keys move through its days or values. A panel with nothing to show collapses to one line.

**Export time entries** in the menu next to the period chooser downloads a CSV of the period's entries, made on this device. The columns are those of the [server's CSV](time-tracking.md#export).

In a shared project a completed task counts for whoever completed it; older tasks count for their assignee, or for you when unassigned. Tasks in the Trash are left out.

Statistics are computed on this device. Nothing is sent or stored, they work offline, and synced devices show the same numbers. The [Loop home](method/overview.md)'s Loop pulse uses the same definitions.

## Weekly digest by email

In **Settings → Notifications → Weekly digest**, turn on an email for your review day: last week's numbers, overdue tasks, what is due in the next seven days, projects without a next action, when you last reviewed, and a link to the review. What counts as without a next action is in [Places](method/places.md#projects-without-a-next-action). Pick the day and hour; your time zone and language come from the browser and are shown on the card.

The digest uses the same definitions as Statistics, your day start included. It needs [outgoing email](self-hosting/outgoing-email.md) set up by the server owner, contains task names, and is not available with end-to-end encryption: turning encryption on switches it off. A failed send is retried for six hours.
