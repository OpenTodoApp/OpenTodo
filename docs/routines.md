---
title: Routines
summary: A routine is a rule with several steps, each using what the steps before it produced, such as turning the lines of a note into tasks every Friday.
audience: user
section: Reference
screens: [routines]
specs: [automation-rules, routines]
order: 31
---
# Routines

A routine does several things in a row, each step using what the steps before it produced: *every Friday at 17:00, read the note of Groceries, split it into lines and make each line a task in Errands*. Every [automation rule](automations.md) is a routine of one step and keeps working as before; nothing is converted. Routines are in the sidebar's **More** group and in the command palette (**Go to Routines**, **New routine**, **Run routine…**); the old address `/rules` opens them.

## The Routines page

Each routine is one row: its switch, its trigger and steps as one line (*Every Friday at 17:00 → get the note text of the task, split the note text into lines, create tasks from the lines in Errands*), when it last ran and how often this week, how many steps are not available, **Run now** and a menu (Edit, Duplicate, Run now, Test, History, Move up, Move down, Delete). **Pause all routines** is in the page's menu. The **Runs** tab lists every run. Offline the routines are listed and editable from your device; runs and counts need a connection.

## The editor

A routine reads as cards stacked one under the other: a **When** card (the trigger and its conditions, with the number of open tasks that match now) and one card per step, each a sentence such as *Create tasks from **the lines** in **Errands***. Every bold word is a button: tap it to choose a project, a label, a task or a view, type a text, pick a date or a number, or use what an earlier step produced. That output is shown at the end of each card (*→ the lines · 7 lines*) and offered as a chip to later steps, the fitting ones first; values of another type are listed under **Needs conversion** with the step that converts them. Inside **Repeat for each** the current item is a chip too, and **If** shows its **Then** and **Otherwise** steps indented under it. On a phone the editor fills the screen; on a computer it is a wide dialog.

**+ Add step** opens a search over every step, by name, description or a word you would use (*mail* finds Email me, *loop* finds Repeat for each), in your language and in English. Without a search it suggests the steps that fit the output of the step above, then lists the groups. A step that is not set up is left out of the lists; a search still shows it, dimmed, with what to set up and a link. A saved step that stops being available is marked **Not available** with the reason and a link to the setting.

Each card shows a **preview** of what it would do, updated as you edit: text, lists, logic, Find tasks by a condition and Change tasks are worked out on your device from your data, also offline; other steps are previewed by the server while you are online (*Preview needs a connection* otherwise). A preview never writes, sends or logs anything; *Would write 620 of 500* warns before a run would pass a limit. A step that receives the wrong kind of value says so on its card (*Notify me expects Text, got Tasks*) with a one-tap fix such as **Insert Format text**; Save waits until type errors are fixed. `Ctrl+Z` takes back the last edit.

**Test** runs the routine as a test: every step is planned, nothing is written, and the result is shown step by step (for a saved routine it is logged as a test run). **Save** works offline and syncs later; **Run now** needs a connection. Keyboard: `Alt+↑` / `Alt+↓` move the focused step, `a` adds a step below it, `Delete` asks to delete it, `←` / `→` move between its words, `Ctrl+Enter` saves and `Ctrl+Shift+Enter` tests. Routines of several steps can also be made through the [API](api.md#routines), the [CLI](cli.md#routines) and [MCP](mcp.md).

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

Every run is logged with its trigger, each step's status, time, count and the items it touched, and its outcome. A routine's **History** tab (in the editor) and the page's **Runs** tab list runs newest first, 50 at a time, filtered by routine, outcome and source (scheduled, by its trigger, by hand, an AI assistant, test). A run opens step by step: each step's status and time, the tasks it touched as links (*Deleted task* when gone), why it stopped with a link to the setting, and steps after a failure as *Not run*. Offline the last page fetched is shown with its age. The server keeps only ids and counts, your devices show the titles. **Undo** takes a whole run back: values it changed go back unless you changed them since, and what it created goes to the Trash. Notifications, deliveries and emails cannot be taken back. The undo shows in history as **Routine (name) undone**.

## Not offered, on purpose

Email to any address (the server would send mail its owner did not write), fetching a web page or a feed (a routine contacts nothing but your webhooks and the owner's mail server), creating calendar events (dated tasks already reach your calendars) and running scripts.

## Encrypted accounts

A routine that only uses ids, dates, numbers and conditions runs on the server as for any account. One with a step that reads or writes text is skipped with **encrypted** until routines can run on your own devices; Email me is never available with [end-to-end encryption](e2ee.md).
