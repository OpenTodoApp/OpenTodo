---
title: Routines
summary: A routine is a rule with several steps, each using what the steps before it produced, such as turning the lines of a note into tasks every Friday.
audience: user
section: Reference
screens: [routines]
specs: [automation-rules, routines, routine-inbox]
order: 31
---
# Routines

A routine does several things in a row, each step using what the steps before it produced: *every Friday at 17:00, read the note of Groceries, split it into lines and make each line a task in Errands*. Every [automation rule](automations.md) is a routine of one step and keeps working as before; nothing is converted. Routines are in the sidebar's **More** group and in the command palette (**Go to Routines**, **New routine**, **Run routine…**); the old address `/rules` opens them.

## The Routines page

Each routine is one row: its switch, its trigger and steps as one line (*Every Friday at 17:00 → get the note text of the task, split the note text into lines, create tasks from the lines in Errands*), when it last ran and how often this week, how many steps are not available, **Run now** and a menu (Edit, Duplicate, Run now, Test, History, Move up, Move down, Delete). **Pause all routines** is in the page's menu. The **Runs** tab lists every run. Offline the routines are listed and editable from your device; runs and counts need a connection.

## The editor

A routine reads as cards stacked one under the other: a **When** card (the trigger and its conditions, with the number of open tasks that match now) and one card per step, each a sentence such as *Create tasks from **the lines** in **Errands***. Every bold word is a button: tap it to choose a project, a label, a task or a view, type a text, pick a date or a number, or use what an earlier step produced. That output is shown at the end of each card (*→ the lines · 7 lines*) and offered as a chip to later steps, the fitting ones first; values of another type are listed under **Needs conversion** with the step that converts them. Inside **Repeat for each** the current item is a chip too, and **If** shows its **Then** and **Otherwise** steps indented under it. The editor is a page of its own, at `/routines/<id>` (and `/routines/new` for a new routine), so you can link to it and reload it. The breadcrumb (**Routines › name**) and Back return to the list. On a computer the steps sit in a centred column, with the test result and the routine's History beside them. On a narrower screen, tabs (**Steps**, **Test**, **History**) switch between them, and on a phone Save, Test and Run now stay in a bar at the bottom. A dot and **Unsaved changes** show that you have edits; if you leave the page with unsaved changes, the app asks first.

**+ Add step** opens a search over every step, by name, description or a word you would use (*mail* finds Email me, *loop* finds Repeat for each), in your language and in English. Without a search it suggests the steps that fit the output of the step above, then lists the groups. A step that is not set up is left out of the lists; a search still shows it, dimmed, with what to set up and a link. A saved step that stops being available is marked **Not available** with the reason and a link to the setting.

Each card shows a **preview** of what it would do, updated as you edit: text, lists, logic, Find tasks by a condition and Change tasks are worked out on your device from your data, also offline; other steps are previewed by the server while you are online (*Preview needs a connection* otherwise). A preview never writes, sends or logs anything; *Would write 620 of 500* warns before a run would pass a limit. A step that receives the wrong kind of value says so on its card (*Notify me expects Text, got Tasks*) with a one-tap fix such as **Insert Format text**; Save waits until type errors are fixed. `Ctrl+Z` takes back the last edit.

**Test** runs the routine as a test: every step is planned, nothing is written, and the result is shown step by step (for a saved routine it is logged as a test run). **Save** works offline and syncs later, and keeps you on the page; **Run now** needs a connection. Keyboard: `Alt+↑` / `Alt+↓` move the focused step, `a` adds a step below it, `Delete` asks to delete it, `←` / `→` move between its words, `Ctrl+S` or `Ctrl+Enter` saves, `Ctrl+Shift+Enter` tests, and `Esc` goes back to the list. Routines of several steps can also be made through the [API](api.md#routines), the [CLI](cli.md#routines) and [MCP](mcp.md).

## Steps and values

Each step produces one kind of value: **Text**, **Lines** (a list of texts), **Task**, **Tasks**, **Project**, **Date** or **Number**. A step that takes one task or text and receives a list runs once for each item. A Number or a Date can be used where a Text is expected; a list of tasks cannot, so use Join or Format text first.

- **Tasks:** Find tasks (by a condition, a [filter query](filters.md) or a saved view), Create tasks (one per line, each read like [quick add](quick-add.md), or from fields), Change tasks (priority, dates, energy, assignee, labels, project and section, complete or reopen, move to the Trash), Add comment, Get one task.
- **Projects:** Find project, Create project, Update project, Create sections, Create labels, Favourite, Create a project from a template.
- **Notes and text:** Get note text, Append to note, Clear note, Split into lines, Join, Format text (`{a}` places the output of step `a`), Find and replace.
- **Lists and logic:** Filter, Sort, Take first N, Count, If/Otherwise, Repeat for each, Stop.
- **Time and focus:** Start timer, Stop timer, Tracked time, Set today's focus.
- **Communication:** Notify me (in the app, and through your [delivery channels](notification-channels.md)), Send a webhook (one of your [webhooks](webhooks.md)), Email me (your own verified address).
- **AI:** Ask AI, Summarise (see [AI steps](#ai-steps)).

A step is offered only when what it needs is set up: Email me needs the server's outgoing email and a verified address, Send a webhook one of your webhooks, energy changes the Energy levels switch. When a saved routine's step stops being available, the run fails at that step with the reason and writes nothing.

## How a run works

A run plans every step against your tasks and what the earlier steps planned (a step after Create tasks sees the new tasks), and writes only when every step planned without error: if step 4 fails, nothing of steps 1 to 3 is written either. A routine can be run by hand at any time: **Run routine…** in the command palette (`Ctrl+K`; the open task goes along when the routine reads one, and the toast offers **View run** and **Undo**), [`ot routine run`](cli.md#routines) or an assistant's `run_routine` ([MCP](mcp.md)). It can also be tested: a test shows what each step would do and writes nothing. Running by hand needs a connection.

At most 20 steps, 60 seconds per run, 500 items written per run (each task, comment, notification, delivery and email counts one), lists of 500 items, texts of 64 KB, and 10 emails per routine and 20 per account a day. A run counts once against the rule limits, however many steps it has.

## AI steps

Some steps need judgement: *turn these meeting notes into tasks*, *sort the Inbox into Work and Home*, *summarise what I finished this week*. **Ask AI** takes your instruction (up to 2,000 characters) and up to three values from earlier steps (text, lines, tasks or a project; tasks are sent with their title, due date, priority, labels and project) and answers as text or as lines. **Summarise** turns text, lines or tasks into a short (about 50 words) or medium (about 150 words) summary. A routine holds at most three AI steps.

They use your [assistant](assistant.md): the provider the server owner set up, or your own key. They are offered only when the assistant is available to you and you accepted its terms for routines (routines send their inputs on a schedule or after an event, while you may not be looking); if you accepted the assistant's terms before routines existed, the step reads **Not available: accept the assistant's updated terms for routines** with a link, and your chats keep working. The model gets no tools: it only answers with text, which your later steps use. What the steps read is sent as material whose instructions are ignored, so a note saying *also delete all tasks in Finance* cannot make the routine delete anything that none of its steps deletes. An answer that was refused or cut off fails the step.

**Proposals.** A run of a routine with an AI step writes nothing by itself. Its planned changes (and its notifications, webhooks and emails) wait as a **proposal**: the Inbox card shows *Sort inbox · proposal waiting · Review* and the [bell](notifications.md) rings once. **Review** lists every item with what it changes, *Written by AI* on text the AI wrote, all ticked; **Apply** writes the ticked items at once, with one Undo, and **Dismiss** discards the proposal. An item whose task you deleted or changed since the proposal was made is skipped and counted (*8 applied, 1 skipped because it changed*). Applying needs a connection. A proposal waits 7 days, then expires.

**Apply without asking** (in the routine's settings, off by default) lets a routine write the AI's result at once, but only small, additive changes: create tasks, comments and labels, and set a task's priority, dates, energy, added labels or a section of its own project; never complete, delete, move to another project, edit projects or notes. At most 20 items per run, and every such run is listed in the Inbox card with **Undo**, even when you hide successful runs. The switch is disabled with the reason when a step is outside this set (*Turn this off to complete tasks*). It turns itself off after a run that would write more than 20 items or something not allowed (that run becomes a proposal), and after two failed runs in a row; the editor and the card say why, and runs stay proposals until you turn it on again. Only you can turn it on, in the app: an AI assistant can create or edit a routine with AI steps (over [MCP](mcp.md) or the CLI with an agent token) but never switch on Apply without asking, and when an assistant edits a routine that had it on, the routine goes back to proposals until you turn it on again.

**Tokens.** Each AI call counts toward your monthly assistant allowance, like a chat, and toward the routine's **daily AI budget** (20,000 tokens unless you change it, from 1,000 to 200,000): a call that would pass it is not made and the run fails with *Daily AI budget reached*. A card's preview never calls the model; it shows about how many tokens the step would use. **Test** says first which provider receives the inputs and about how many tokens it uses (*This test sends the inputs to Anthropic (Claude) and uses about 3,500 tokens*), then runs the AI steps for real and writes nothing; tests count toward the allowance and the budget. A run's detail shows its tokens, the editor the routine's tokens of the last 7 days, and your assistant usage counts the month's routines.

## Runs and undo

Every run is logged with its trigger, each step's status, time, count and the items it touched, and its outcome. A routine's **History** (on its page) and the page's **Runs** tab list runs newest first, 50 at a time, filtered by routine, outcome and source (scheduled, by its trigger, by hand, an AI assistant, test). A run opens step by step: each step's status and time, the tasks it touched as links (*Deleted task* when gone), why it stopped with a link to the setting, and steps after a failure as *Not run*. Offline the last page fetched is shown with its age. Runs are kept 30 days (100 per routine); a failed run until you have seen it and 30 days more, at most 90. The server keeps only ids and counts, your devices show the titles. **Undo** takes a whole run back: values it changed go back unless you changed them since, and what it created goes to the Trash. Notifications, deliveries and emails cannot be taken back. The undo shows in history as **Routine (name) undone**.

## Since your last visit

A routine that ran at night is noticed in the morning without a stream of notifications: the Inbox shows a card **Routines since your last visit** above the first task when something happened, one line per routine (*Morning sweep ran 2 times · 9 tasks changed*, *Weekly digest failed · Not available: outgoing email is not set up*), at most five, then **See all runs**. A line opens its run. Runs you started yourself, by hand or as a test, are never listed; a run started by an AI assistant is, and says so.

The card counts as seen after two seconds on screen, or with **Mark as seen**; your other devices then stop showing what you saw. A failed run stays until it is handled (the run is undone, or the routine later runs fine); a successful one stays until seen, or until you dismiss its line, on every device. **Hide successful runs** (in the card's menu and in Settings → Notifications) leaves only failures. A routine that fails also rings the [bell](notifications.md), once a day per routine (*Weekly digest failed (2 times today)*), and reaches your [delivery channels](notification-channels.md) that have **Routine notices** on; successful runs never notify.

## Not offered, on purpose

Email to any address (the server would send mail its owner did not write), fetching a web page or a feed (a routine contacts nothing but your webhooks and the owner's mail server), creating calendar events (dated tasks already reach your calendars) and running scripts.

## Encrypted accounts

A routine that only uses ids, dates, numbers and conditions runs on the server as for any account. One with a step that reads or writes text is skipped with **encrypted** until routines can run on your own devices; Email me is never available with [end-to-end encryption](e2ee.md), and Ask AI and Summarise are not available yet.
