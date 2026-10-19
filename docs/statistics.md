---
title: Statistics and the weekly digest
summary: See what you completed, created and let slip, all computed on your device, and get an optional weekly digest by email on your review day.
audience: user
section: Guides
specs: [statistics, email-digest]
screens: [stats#statistics]
order: 25
---
# Statistics and the weekly digest

<picture><source srcset="images/stats-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/stats-light.webp" alt="The Statistics screen for this week: the period chooser, five numbers (completed, created, completed late, slipped, overdue now), bar charts per day and per project with every value printed, and the lists of late and slipped tasks."></picture>

## Statistics

Open **Statistics** under More, or press <kbd>g</kbd> <kbd>Shift+S</kbd>. Choose this week, last week, the last 4 or 12 weeks with the arrow keys. Weeks start on your [first day of the week](dates-and-times.md).

- **Completed**: tasks and subtasks completed in the period. Each day of a recurring task counts once; a skipped day of a habit never counts.
- **Created**: new tasks. Completing a recurring task does not create one.
- **Completed late**: completed on a day after the due day.
- **Slipped**: due in the period, before today, and not done by the end of the period.
- **Overdue now**: open and due before today, outside archived projects.

Charts show completions per day, per week, per weekday and per project (the top five and "other"). Every value is printed, and screen readers get a table. Tasks in the Trash are left out.

In a shared project a completed task counts for whoever completed it. Older tasks that do not record that count for their assignee, or for you when unassigned.

Statistics are computed on this device from your tasks. Nothing is sent to the server or stored, they work offline, and every synced device shows the same numbers. The [Loop home](method/overview.md)'s Loop pulse uses the same definitions for what was completed this week, last week and per day, so the two screens never disagree. With end-to-end encryption the numbers are the same and project names are decrypted on your device.

## Weekly digest by email

In **Settings → Notifications → Weekly digest**, turn on an email for your review day: last week's numbers, overdue tasks, what is due in the next seven days, projects without a next action, when you last reviewed, and a link to the review. What counts as without a next action is in [Places](method/places.md#projects-without-a-next-action). Pick the day and hour; your time zone and language come from the browser and are shown on the card.

The digest uses the same definitions as Statistics. It needs [outgoing email](self-hosting/outgoing-email.md) set up by the server owner, contains task names, and is not available with end-to-end encryption: turning encryption on switches it off. A failed send is retried for six hours.
