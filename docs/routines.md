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

A routine does several things in a row, each step using what the steps before it produced: *every Friday at 17:00, read the note of Groceries, split it into lines and make each line a task in Errands*. Every [automation rule](automations.md) is a routine of one step and keeps working as before; nothing is converted. Routines are in the sidebar's **More** group and in the command palette (**Go to Routines**, **New routine**, **Describe a routine**, **Run routine…**); the old address `/rules` opens them.

## The Routines page

**New routine** opens the editor on an empty routine; **Start from a starter** opens the starters (below); **Describe it** lets the assistant draft one from a sentence (below). Each routine is one row: its switch, its trigger and steps as one line (*Every Friday at 17:00 → get the note text of the task, split the note text into lines, create tasks from the lines in Errands*), when it last ran and how often this week, how many steps are not available, **Run now** and a menu (Edit, Duplicate, Run now, Test, History, Move up, Move down, Delete). **Pause all routines** is in the page's menu. The **Runs** tab lists every run. Offline the routines are listed and editable from your device; runs and counts need a connection.

## Start from a starter

**Start from a starter** (on the Routines page, and under it while you have no routine yet) lists ready-made routines by category, at `/routines/starters`. They ship with the app, so they work offline, in your language. Type to search their names, summaries and step names, in your language or in English; `↓` moves into the list, the arrows move between starters and Enter opens one.

| Starter | What it does |
|---|---|
| Groceries from a note | Every Friday at 17:00, the lines of a project's note become tasks in another project |
| Sunday overdue sweep | Every Sunday at 18:00, overdue tasks move to Monday, and a notification says how many |
| Evening roll-over | Every evening at 21:00, what is still due today moves to tomorrow |
| Morning focus | On weekday mornings, the three highest-priority tasks due today become today's focus (needs today's focus) |
| Done journal | When you complete a task, "Done:" and its title are added to the note of a project |
| Note to subtasks | Run on a task: each line of its note becomes a subtask |
| Waiting follow-up | When a task gets your waiting label, a comment notes the day and the task is due in three days |
| Friday digest by email | Every Friday at 16:00, an email lists the tasks you completed this week (needs outgoing email) |
| Meeting notes to tasks | Run on a meeting task: the open checkboxes of its note become tasks in its project |
| Inbox over 20 | On weekday mornings, a notification when the Inbox holds more than 20 tasks |
| Monthly review | On the first of every month, a review project from the Weekly review template |

A starter's page shows what it does as the editor's sentences, what it **needs** (a step that is not set up on your server says why), and **your choices**: the project or label it works with. A project or label with the suggested name is chosen already; otherwise the list next to the word starts with **Create *Groceries***. **Use this starter** waits until every choice is made (*Fill 1 choice first*), then opens the editor on a new routine with the starter's name. Nothing is saved until you save it there, apart from a project or label you chose to create; from then on it is your routine, edited like any other. Starters never hold a task chosen by hand: they read the task that triggered, the task you run them on, or tasks an earlier step found.

Anyone can propose a starter: see [the template library's guide](https://github.com/OpenTodoApp/OpenTodo/blob/main/templates/README.md#routine-templates).

## Describe it

Some routines are easier to say than to build. **Describe it** (on the Routines page, and **Describe a routine** in the command palette, at `/routines/describe`) opens a sheet with one field: *Describe what should happen, and when*, at most 500 characters, such as *every Friday at five, make tasks in Errands from my Groceries note*. **Draft** sends it to your [assistant](assistant.md) and opens the editor on the routine it drafted: here a Friday 17:00 trigger, **Get the note text of Groceries**, **Split into lines** and **Create tasks in Errands**, with the banner **Drafted by AI: check each step, then Save**.

- **Nothing happens by itself.** The draft is not saved, switched on, tested or run: it is an unsaved routine in the editor (leaving asks first), and only Save makes it yours. A draft never turns on Apply without asking.
- **Only what you can use.** The assistant gets the steps available to you (a step that is not set up, such as Email me without outgoing email, is never offered; the banner then says what it did instead) and the names of your projects, sections, labels, saved views and webhooks (by their host), so it can point at them. Those names are sent as material whose instructions are ignored. It never picks a task by hand: tasks come from the trigger, Find tasks, Pick or Repeat for each.
- **Checked before you see it.** The draft is type-checked like a routine you build; if it does not check, the assistant gets the errors and one more try. Errors it could not fix show on their cards, with their fixes, as in any routine.
- **Who sees it.** Describe it is offered only when you can use the assistant: the server owner turned it on and you accepted its terms for the provider in use. Otherwise the Routines page shows New routine and Start from a starter, and a search for *describe* in the command palette offers **Set up the assistant to describe a routine**. It counts as one assistant turn toward your monthly allowance (shown in your assistant usage as routine drafts), and at most 10 drafts an hour. Offline it says it needs a connection to the provider; nothing is queued.
- **Encrypted accounts.** With [end-to-end encryption](e2ee.md) the draft is made on your device by the [on-device assistant](assistant.md), with your device's provider and key and your decrypted names, and checked there; nothing about it reaches the OpenTodo server.

Describe it is not offered in the CLI or over MCP: an AI assistant connected over MCP already writes routines itself with `create_routine`, from the same catalogue and checks.

## The editor

A routine reads as cards stacked one under the other: a **When** card (the trigger and its conditions, with the number of open tasks that match now) and one card per step, each a sentence such as *Create tasks from **the lines** in **Errands***. Every bold word is a button. A choice (what the trigger or an earlier step produced, a project, a label, a view, a date or a number) opens a short list next to the word: type to narrow it, arrows and Enter to choose, Escape to close. A text is edited right in the card: type `/` (the list opens at the cursor) or **+ value** to insert what an earlier step produced; Enter, Escape or clicking elsewhere keeps what you typed. The card then shows the whole text with those values as chips. A step you have just added does not complain about an empty value while you fill it in: *needs a value here* shows once you move on or press Save. Condition rows and the changes of Change tasks open inside the card on a wide screen, and from the bottom of the screen on a narrower one. That output is shown at the end of each card (*→ the lines · 7 lines*) and offered as a chip to later steps: inside **Repeat for each** the current item first (*each task*), then earlier outputs, nearest first, then the trigger's (*the task that triggered*, *the matching tasks*, or *the task you run it on* for a routine you run by hand); values of another type are listed under **Needs conversion** with the step that converts them. A step you add is already wired to the data that flows to it: *Add a comment* under *Find tasks* comments on the tasks it found, inside Repeat for each on each task. **If** shows its **Then** and **Otherwise** steps indented under it. The editor is a page of its own, at `/routines/<id>` (and `/routines/new` for a new routine), so you can link to it and reload it. The breadcrumb (**Routines › name**) and Back return to the list. On a computer the steps sit in a centred column, with the test result and the routine's History beside them. On a narrower screen, tabs (**Steps**, **Test**, **History**) switch between them, and on a phone Save, Test and Run now stay in a bar at the bottom. A dot and **Unsaved changes** show that you have edits; if you leave the page with unsaved changes, the app asks first.

**+ Add step** opens a search over every step, by name, description or a word you would use (*mail* finds Email me, *loop* finds Repeat for each), in your language and in English. Without a search it suggests the steps that fit the data flowing to that place (the step above, a Repeat's item, the trigger), then lists the groups. A step that is not set up is left out of the lists; a search still shows it, dimmed, with what to set up and a link. A saved step that stops being available is marked **Not available** with the reason and a link to the setting.

Each card shows a **preview** of what it would do, updated as you edit: text, lists, logic, Find tasks by a condition and Change tasks are worked out on your device from your data, also offline; other steps are previewed by the server while you are online (*Preview needs a connection* otherwise). A preview never writes, sends or logs anything; *Would write 620 of 500* warns before a run would pass a limit. A step that receives the wrong kind of value says so on its card (*Notify me expects Text, got Tasks*) with a one-tap fix such as **Insert Format text**; an empty input offers **Use the tasks** (what flows there) or **Find tasks…** (a Find tasks step above it); Save waits until type errors are fixed. `Ctrl+Z` takes back the last edit.

**Test** runs the routine as a test: every step is planned, nothing is written, and the result is shown step by step (for a saved routine it is logged as a test run). **Save** works offline and syncs later, and keeps you on the page; **Run now** needs a connection. Keyboard: `Alt+↑` / `Alt+↓` move the focused step, `a` adds a step below it, `Delete` asks to delete it, `←` / `→` move between its words, `Ctrl+S` or `Ctrl+Enter` saves, `Ctrl+Shift+Enter` tests, and `Esc` goes back to the list. Routines of several steps can also be made through the [API](api.md#routines), the [CLI](cli.md#routines) and [MCP](mcp.md).

## Steps and values

Each step produces one kind of value: **Text**, **Lines** (a list of texts), **Task**, **Tasks**, **Project**, **Date** or **Number**. Routines work on what the trigger and earlier steps produce, not on tasks you pick by hand: every step that acts on tasks takes a list, and one task is a list of one. A step that takes one task or text and receives a list runs once for each item, so *Comment on the tasks* comments on each. A Number or a Date can be used where a Text is expected; a list of tasks cannot, so use Join or Format text first.

**Pick** chooses which items go on: *Pick **the first** of **the tasks***, and its first word switches to the last, the first N, the last N, all, or *the ones where* a condition holds (the same condition rows as Find tasks; for lines, *contain* or *don't contain*). Pick reads its list in the order it comes in; a Pick card that reads tasks straight from Find tasks says *In list order* with **Sort first**, which puts a Sort step (by date) before it. So *When I run it: find my overdue tasks, pick the first, comment "Still on it?"* is three cards: Find tasks → Pick the first → Comment on the picked task.

A task chosen by hand is for the rare fixed target (a log or list kept in one task): it is folded under **A specific task…** at the end of a task picker, and **Get a specific task** is found by search; a card holding one reads *Always this task*. Projects, sections, labels, views, templates and webhooks are chosen as usual.

- **Tasks:** Find tasks (by a condition, a [filter query](filters.md) or a saved view; a query that names `completed` finds completed tasks too, such as `completed = this week`; tasks of archived projects only with **Archived projects** on, see [below](#which-tasks-a-routine-finds)), Create tasks (one per line, each read like [quick add](quick-add.md), or from fields; in a project, or as subtasks of a task), Change tasks (priority, dates, energy, assignee, labels, project and section, complete or reopen, move to the Trash), Add a comment, Get a specific task.
- **Projects:** Find project, Get the project of a task, Create project, Update project, Create sections, Create labels, Favourite, Create a project from a template.
- **Notes and text:** Get note text, Add to a note, Clear a note (of a task, or of a project you choose), Split into lines (optionally only the open checkboxes, `- [ ] …`), Join, Format text (`{a}` places the output of step `a`), Find and replace.
- **Lists and logic:** Pick, Sort, Count, If/Otherwise, Repeat for each, Stop.
- **Time and focus:** Get the date (today, tomorrow or in N days), Start timer (several tasks in turn leave the last one running), Stop timer, Tracked time, Set today's focus.
- **Communication:** Notify me (in the app, and through your [delivery channels](notification-channels.md)), Send a webhook (one of your [webhooks](webhooks.md)), Email me (your own verified address).
- **AI:** Ask AI, Summarise (see [AI steps](#ai-steps)).

A step is offered only when what it needs is set up: Email me needs the server's outgoing email and a verified address, Send a webhook one of your webhooks, energy changes the Energy levels switch. When a saved routine's step stops being available, the run fails at that step with the reason and writes nothing.

### Which tasks a routine finds

Find tasks, and the matching tasks of a routine that runs on a schedule with a condition, look at the same tasks your lists show. Tasks in the Trash are never found, and neither are the tasks of a project in the Trash; nothing changes that. Tasks of an **archived** project are left out too, as the Filter view, saved views, Today and Upcoming leave them out, so a saved view finds in a routine what it lists on its own page. To include them on purpose, open the Find tasks card's menu and choose **Add archived projects**: the card then reads *· Archived projects yes*. Only the task's own project counts. Completed tasks keep their rule: a condition finds open tasks, a query or view finds completed ones when it names `completed` or `open`. The card's preview and the **When** card's count follow the same rule.

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

A routine that only uses ids, dates, numbers and conditions runs on the server as for any account. The server cannot read your text with [end-to-end encryption](e2ee.md), so a routine with a step that reads or writes text, or an AI step, runs on one of your own devices:

- Turn on **Run my routines on this device** in Settings → Encryption, or from the warning in the editor (*This routine reads text, so it runs on one of your devices. When it is due, a device with Run my routines turned on must be online and unlocked.*). It needs an unlocked device and a recent sign-in confirmation, stays on when the device locks, and ends when you sign out there or turn encryption off. Any of your devices can turn it off for another one.
- When the routine is due, the server records the run as **Waiting for one of your devices** and sends its ids, never its text, to the device you used most recently that is online and unlocked. The device plans the routine on its own decrypted copy exactly as the server would, and sends the result back encrypted; the run's record holds ids and counts. While it runs the device shows *Running Groceries…*, and Settings → Encryption lists its recent runs.
- With no such device online the run waits; only the latest occurrence of each routine waits (the earlier ones are recorded as superseded), and the first suitable device that connects runs it. After 24 hours it is recorded as missed (*No device was available*), a failure in the Inbox card and the bell. Without any device turned on, such a routine is skipped with **encrypted**, and its row says so.
- **Run now** runs it on the device in hand.
- [AI steps](#ai-steps) call the provider of the [on-device assistant](assistant-encrypted.md), on a device where it is set up and its terms for routines accepted. Their results wait as a proposal that only your devices can read: it is encrypted on the device that ran the routine, and any of your devices opens it for review and applies the items you keep.
- Email me and Send a webhook with text are not available (the server would have to see the text). Notify me reaches your in-app notifications encrypted, and your delivery channels as *A routine has a notice* without the text.
