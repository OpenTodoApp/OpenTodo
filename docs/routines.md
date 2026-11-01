---
title: Routines
summary: A routine is a rule with several steps, each using what the steps before it produced, such as turning the lines of a note into tasks every Friday.
audience: user
section: Reference
screens: []
specs: [automation-rules, routines]
order: 31
---
# Routines

A routine does several things in a row, each step using what the steps before it produced: *every Friday at 17:00, read the note of Groceries, split it into lines and make each line a task in Errands*. Every [automation rule](automations.md) is a routine of one step and keeps working as before; nothing is converted. Until the routine editor arrives, the Rules page edits one-step routines and lists one of more steps as **Made with a newer version** (its switch and deletion still work); routines of several steps are made through the [API](api.md#routines).

## Steps and values

Each step produces one kind of value: **Text**, **Lines** (a list of texts), **Task**, **Tasks**, **Project**, **Date** or **Number**. A step that takes one task or text and receives a list runs once for each item. A Number or a Date can be used where a Text is expected; a list of tasks cannot, so use Join or Format text first.

- **Tasks:** Find tasks (by a condition, a [filter query](filters.md) or a saved view), Create tasks (one per line, each read like [quick add](quick-add.md), or from fields), Change tasks (priority, dates, energy, assignee, labels, project and section, complete or reopen, move to the Trash), Add comment, Get one task.
- **Projects:** Find project, Create project, Update project, Create sections, Create labels, Favourite, Create a project from a template.
- **Notes and text:** Get note text, Append to note, Clear note, Split into lines, Join, Format text (`{a}` places the output of step `a`), Find and replace.
- **Lists and logic:** Filter, Sort, Take first N, Count, If/Otherwise, Repeat for each, Stop.
- **Time and focus:** Start timer, Stop timer, Tracked time, Set today's focus.
- **Communication:** Notify me (in the app, and through your [delivery channels](notification-channels.md)), Send a webhook (one of your [webhooks](webhooks.md)), Email me (your own verified address).

A step is offered only when what it needs is set up: Email me needs the server's outgoing email and a verified address, Send a webhook one of your webhooks, energy changes the Energy levels switch. When a saved routine's step stops being available, the run fails at that step with the reason and writes nothing.

## How a run works

A run plans every step against your tasks and what the earlier steps planned (a step after Create tasks sees the new tasks), and writes only when every step planned without error: if step 4 fails, nothing of steps 1 to 3 is written either. A routine can be run by hand at any time: **Run routine…** in the command palette (`Ctrl+K`; the open task goes along when the routine reads one, and the toast offers **View run** and **Undo**), [`ot routine run`](cli.md#routines) or an assistant's `run_routine` ([MCP](mcp.md)). It can also be tested: a test shows what each step would do and writes nothing. Running by hand needs a connection.

At most 20 steps, 60 seconds per run, 500 items written per run (each task, comment, notification, delivery and email counts one), lists of 500 items, texts of 64 KB, and 10 emails per routine and 20 per account a day. A run counts once against the rule limits, however many steps it has.

## Runs and undo

Every run is logged with its trigger, each step's status, time, count and the items it touched, and its outcome; failed runs are kept for 90 days. The server keeps only ids and counts, your devices show the titles. **Undo** takes a whole run back: values it changed go back unless you changed them since, and what it created goes to the Trash. Notifications, deliveries and emails cannot be taken back. The undo shows in history as **Routine (name) undone**.

## Not offered, on purpose

Email to any address (the server would send mail its owner did not write), fetching a web page or a feed (a routine contacts nothing but your webhooks and the owner's mail server), creating calendar events (dated tasks already reach your calendars) and running scripts.

## Encrypted accounts

A routine that only uses ids, dates, numbers and conditions runs on the server as for any account. One with a step that reads or writes text is skipped with **encrypted** until routines can run on your own devices; Email me is never available with [end-to-end encryption](e2ee.md).
