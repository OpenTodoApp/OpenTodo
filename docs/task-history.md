---
title: Task history
summary: Every change to a task is kept: see who changed what and from where, restore one value or a whole version, and follow the activity of a task.
audience: user
section: Guides
specs: [trash-and-history, activity-log]
screens: []
order: 131
---
# Task history

<picture><source srcset="images/history-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/history-light.webp" alt="The History list of a task, showing changes to its description, assignee, title and priority, each with a Restore this value link."></picture>

Every change to a task is kept, so you can see what happened and put any value back.

## See what changed on a task

Open a task and select the **History** tab below its details. Changes are grouped into versions, newest first: everything one person changed from one device within a few minutes is one version, with a one-line summary such as "Renamed and rescheduled", who made it, where (this device, another device, the API, a calendar app, or an AI assistant) and when. Select a version to see each change: the old value struck through and the new one next to it, shown the way the task shows them (dates in your date format, priorities, labels, project and section names). A change marked **not applied** arrived after a newer one and never took effect; you can still restore it. Changes made by an [AI assistant](mcp.md#letting-an-assistant-make-changes) read "AI assistant (*token name*)" for your own assistants and "AI assistant" for someone else's in a shared project, and can be restored like any other change.

Projects have a **History** too: open it from the **⋯** menu in the project's header; it opens beside the list.

History is loaded from your server, so it needs a connection. Offline, the tab says so instead of showing anything out of date.

## Bring back an earlier value

Next to each change in a version is **Restore this value**. Select it to set the field back to that value. To put back everything a version changed at once, select **Restore this version**; a confirmation lists the fields first. Restoring is a change like any other: it syncs to all devices and shows up in the history itself as a new version, so you can always undo the undo. Each field is restored as its own change, so if someone edits the same field on another device at the same time, the later edit wins for that field.

## Activity on a task

The **Activity** tab of a task shows who created it, completed it, moved it or changed the date, newest first. Quick changes by one person within ten minutes are grouped into one line, such as "You changed the due date and priority"; select it to see each change. Comments appear as one short line that opens the comment. Activity works offline; your changes that are not synced yet are marked pending. In shared projects this includes everyone's changes. See [Sharing and comments](sharing.md#see-what-others-changed).
