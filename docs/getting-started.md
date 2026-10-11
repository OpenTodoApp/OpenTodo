---
title: Getting started
summary: From the demo or your first sign-in to adding, scheduling and completing your first task, in about five minutes.
audience: user
section: Get started
specs: [task-management, account-access, web-app, documentation]
screens: []
order: 10
card: quick-add
---
# Getting started

This guide takes you from opening OpenTodo for the first time to adding a task, giving it a date and ticking it off. It takes about five minutes. You can follow along in the demo or on your own server.

## Open OpenTodo

You have three ways in.

### Try the demo

Go to [opentodo-demo.pixari.dev](https://opentodo-demo.pixari.dev) and select **Try the demo**. You get a private sandbox filled with sample projects and tasks. Nobody else can see it, and it is deleted after two hours without activity (and every night), so don't keep anything personal there.

<picture><source srcset="images/demo-signin-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/demo-signin-light.webp" alt="The demo sign-in card with a short explanation and a green Try the demo button."></picture>

### Set up your own server

The first person to open a new OpenTodo server creates the owner account. Enter your name, email and a password of at least 10 characters, then select **Create owner account**. After that, sign-up is closed: other people join with an invitation from you (see [Sharing and comments](sharing.md#invite-someone-new)).

<picture><source srcset="images/setup-owner-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/setup-owner-light.webp" alt="The Create the owner account form with Name, Email and Password fields."></picture>

### Join with an invitation

Open the invitation link you were sent, choose a name and password, and you're in. If your server offers single sign-on or passkeys, the sign-in screen shows those buttons too.

Once you're signed in, the app is stored on your device. You can keep using it without a connection, and it catches up with the server when you're back online.

## Find your way around

The sidebar on the left lists your views and projects. On a phone it's behind the menu button at the top left.

<picture><source srcset="images/today-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/today-light.webp" alt="The Today view: the sidebar with Inbox, Today, Upcoming and projects on the left, and today's tasks with an Overdue group on the right."></picture>

- **Inbox** collects tasks that don't belong to a project yet.
- **Today** shows what's due today, with anything overdue at the top.
- **Upcoming** shows the days ahead, grouped by date.
- **Projects** are your own lists, like "Home renovation" or "Work".

The circle to the left of each task completes it. The small line under the title shows the date, labels and project. More on all the views in [Views](views.md).

## Add your first task

1. Press <kbd>q</kbd>, or click the **Add a task** box at the top of the list.
2. Type what you need to do, for example `Call the dentist`.
3. Press <kbd>Enter</kbd>.

The task appears straight away. The box stays open, so you can type the next one right after.

Where the task goes depends on where you are: in a project it goes into that project, in Today it's due today, and in the Inbox it waits there until you sort it.

## Give it a date

You can schedule a task while you type it. Quick add understands everyday words:

```
Call the dentist tomorrow at 9am
```

As you type, small chips appear under the box to show what OpenTodo understood: a date chip for "tomorrow at 9am", and below them the title that will be saved. If a word was picked up by mistake ("May" as in the name, not the month), click the **×** on its chip and it stays part of the title.

<picture><source srcset="images/quick-add-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/quick-add-light.webp" alt="Quick add with the line Call Sam about the tiles tomorrow at 4pm #Home @call p2 +15m, and chips for the date, project, label, priority and estimate below it."></picture>

The same line can also set a project with `#`, a label with `@`, a priority from `p1` (highest) to `p4`, and how long it will take with `+`, like `+15m`. The [quick add reference](quick-add.md) lists everything it understands, in six languages.

To change the date later, open the task (click it, or select it and press <kbd>Enter</kbd>) and use **Due** in the panel that opens.

## Complete it

When you're done, click the circle next to the task, or select it with <kbd>j</kbd> and <kbd>k</kbd> and press <kbd>c</kbd>. The task leaves the list and moves to **Completed** in the sidebar. Changed your mind? Open Completed and reopen it.

## Get it on your phone

OpenTodo runs in the browser, and you can install it like an app on your phone, tablet or computer. It then opens in its own window and works offline. See [Installing the app](install-app.md).

## Help inside the app

Every guide on this site is also in the app: select **Help** at the bottom of the sidebar, or press <kbd>g</kbd> then <kbd>?</kbd>. It works offline and matches the version of your server. Many screens have a small **Help** link that opens the right section next to what you're doing, without closing it.

## Where to go next

- [Tasks and projects](tasks-and-projects.md): notes, subtasks, priorities and organising your work.
- [Views](views.md): Today, Upcoming, the calendar and views you save yourself.
- [Recurring tasks and reminders](recurring-and-reminders.md): repeat a task every week and get a nudge on time.
- [Keyboard shortcuts](keyboard.md): press <kbd>?</kbd> in the app to see them all.
