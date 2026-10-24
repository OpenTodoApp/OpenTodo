# inbox-triage Specification

## Purpose
A focused mode that walks the Inbox one task at a time with single-key decisions, so a captured list can be processed to empty from the keyboard, offline, without opening each task.

## Requirements

### Requirement: Entering and leaving the triage mode
The client SHALL offer a triage mode for the Inbox, entered with `g` then `p` from anywhere, with `P` on the Inbox, with the Inbox header's primary action "Process" (showing its key `P`), and with the Vim command `triage`. While the Inbox has open Inbox tasks its header meta SHALL say how many are left to sort ("4 to sort"). The mode SHALL show one open Inbox task at a time: its title, its notes read-only, and its due date, labels and reminders if any. Escape SHALL return to the Inbox with the current task selected. When the Inbox has no Inbox task the mode SHALL show the Inbox zero state: the Inbox zero illustration (OpenSpec `design-system`, "Illustrations") above the text "Inbox zero: every task has a place." and the way back. The Process control, the header's count and the mode SHALL count Inbox tasks as OpenSpec `project-organization` defines them.

#### Scenario: Enter with the chord
- **WHEN** focus is not in a text field and the user presses `g` then `p`
- **THEN** the triage mode opens on the first open Inbox task, showing its title and notes

#### Scenario: Enter with P on the Inbox
- **WHEN** the Inbox holds four tasks, focus is not in a text field, and the user presses `P`
- **THEN** the triage mode opens on the first of them; the header had shown "4 to sort" and a primary "Process" button with the key `P`

#### Scenario: Leave with Escape
- **WHEN** the user is on the fourth task and presses Escape
- **THEN** the Inbox list opens with that task selected

#### Scenario: Empty Inbox
- **WHEN** the mode is opened with no open task in the Inbox
- **THEN** it shows the Inbox zero illustration and text with a control that returns to the Inbox, and no decision key does anything

### Requirement: Queue and progress
The queue SHALL be the top-level Inbox tasks (OpenSpec `project-organization`, "Inbox is the default container") in the Inbox's manual order when the mode opens. Tasks that become Inbox tasks meanwhile SHALL join its end. A task that stops being one because of a change from another device, or an edit made outside the mode, SHALL leave it; a task the user decided on in this session (scheduled, moved, delegated, completed, trashed or skipped) SHALL keep its place in the count, so the progress does not jump. The mode SHALL show "n of N", N being the queue length and n the position; a decision or skip advances, `k` returns to the previous task, and after the last task the empty state is shown.

#### Scenario: Progress counts decisions and skips
- **WHEN** the Inbox holds 17 open tasks and the user schedules three and skips one
- **THEN** the mode shows "5 of 17"

#### Scenario: A task arrives from another device
- **WHEN** the user is on "4 of 17" and another device captures a task into the Inbox, which syncs
- **THEN** the new task is appended and the progress reads "4 of 18"

#### Scenario: The current task is moved elsewhere
- **WHEN** the current task is moved into a project by another device and the change syncs
- **THEN** the mode advances to the next task, announces why, and the progress reads with one task fewer

#### Scenario: Subtasks follow their parent
- **WHEN** an Inbox task with two subtasks is moved to a project from the mode
- **THEN** the subtasks move with it and never appear as queue entries of their own

#### Scenario: Scheduling keeps the count stable
- **WHEN** the queue has 10 tasks and the user schedules the first two with `s`
- **THEN** both leave the Inbox, the mode shows "3 of 10", and `k` returns to the second task with its new date shown

### Requirement: Decisions that advance
In the mode, `t` SHALL set the task's due date to today, `c` SHALL complete it, Delete (or Backspace) SHALL move it to the Trash, and `j` or Space SHALL skip it; each SHALL advance to the next task. Enter SHALL open the full detail panel over the card and Escape from the panel SHALL return to the card. Each decision SHALL be exactly the operation the list or detail panel writes for the same action, so it is applied locally first and converges by last-writer-wins.

#### Scenario: Today
- **WHEN** the user presses `t` on an undated task
- **THEN** the task is due today, leaves the Inbox (it is listed in Today), and the next task is shown

#### Scenario: Complete a recurring task
- **WHEN** the user presses `c` on an Inbox task with a repeat rule
- **THEN** the occurrence is recorded and the series moves to its next date exactly as `c` in the list does, and the series stays in the queue only if it is still an open Inbox task

#### Scenario: Trash is restorable
- **WHEN** the user presses Delete on a task
- **THEN** the task and its subtasks are in the Trash, the next task is shown, and restoring from the Trash puts it back in the Inbox

#### Scenario: Open the panel
- **WHEN** the user presses Enter, edits the title in the panel and presses Escape
- **THEN** the card shows the new title and the progress is unchanged

### Requirement: Schedule, move and delegate with a picker
`s` SHALL open the scheduling sheet (see "Scheduling sheet in triage"); `m` SHALL open the project picker; `a` SHALL open a delegate picker of every person assignable in a project the user shares, each entry naming person and project. Confirming SHALL apply the change and advance; Escape SHALL cancel and stay. Delegating SHALL move the task into that project and assign it in one operation set. Decision keys SHALL not fire while a picker or field has focus.

#### Scenario: Schedule with a typed date
- **WHEN** the user presses `s`, types `fri` and presses Enter
- **THEN** the field previews next Friday in words in the user's date format, Enter sets it as the do-on date, the task leaves the Inbox and the next task is shown

#### Scenario: Move to a shared project
- **WHEN** the user presses `m` and picks a project shared with other people
- **THEN** the task appears in that project on every member's devices after sync, by the same cross-scope move the detail panel performs

#### Scenario: Delegate
- **WHEN** the user presses `a`, types `ana` and picks "Ana · Household"
- **THEN** the task is in Household with Ana as assignee, both changes in one batch, and the next task is shown

#### Scenario: Nobody to delegate to
- **WHEN** the user has no shared project with another member
- **THEN** the Delegate button is disabled with the text explaining that delegating needs a shared project, and `a` does nothing

#### Scenario: Cancel a picker
- **WHEN** the user presses `m`, then Escape
- **THEN** no change is written and the same task is still shown

### Requirement: Labels do not advance
`l` SHALL open the label picker for the current task; adding or removing labels SHALL not advance, so a context label can be combined with another decision.

#### Scenario: Label then move
- **WHEN** the user presses `l`, adds `errand`, closes the picker, then presses `m` and picks Home
- **THEN** the task is in Home with the label `errand` and the next task is shown

### Requirement: Someday follows the start field
When the client has the `start` field of the `someday-and-evening` capability, the mode SHALL offer `y` Someday, which SHALL park the task as that capability defines and advance. Until then the decision SHALL be absent from the bar, the key map, the `?` overlay and the keyboard guide, and `y` SHALL do nothing; no label or date SHALL stand in for it.

#### Scenario: Before the field exists
- **WHEN** the client has no `start` field and the user presses `y`
- **THEN** nothing changes and no Someday button is shown

#### Scenario: After the field exists
- **WHEN** the client has the `start` field and the user presses `y`
- **THEN** the task is parked as someday and the next task is shown

### Requirement: Offline and convergent decisions
The mode SHALL work without network: the queue is read from local data and every decision is a local operation queued for upload. Decisions made on two devices for the same task SHALL converge per field by last-writer-wins, and the mode SHALL reflect remote changes to the queue live.

#### Scenario: Offline session
- **WHEN** the device is offline and the user processes five tasks
- **THEN** every decision is visible at once, survives a reload, and all five upload on the next successful sync

#### Scenario: Two devices decide differently
- **WHEN** device A schedules a task for Friday and device B moves the same task to Home, both offline, then both sync
- **THEN** every device shows the task in Home due Friday

### Requirement: Announcements and touch
The card SHALL be a labelled region that receives focus when the mode opens and after each advance. A polite live region SHALL announce the position and title of each task shown and the outcome of each decision in words. Every decision SHALL be a visible button with its key, usable by touch, and the bar SHALL wrap without horizontal scrolling at 360 px wide.

#### Scenario: Screen reader hears the task
- **WHEN** the mode advances to the fourth task "Call the plumber"
- **THEN** the live region announces "4 of 17: Call the plumber"

#### Scenario: Outcome is announced
- **WHEN** the user schedules a task for 2026-10-16
- **THEN** the live region announces the scheduled date in the user's date format before the next task is announced

#### Scenario: Phone width
- **WHEN** the mode is shown at 360 px wide
- **THEN** every decision button is visible and reachable without horizontal scrolling

### Requirement: Vim keybindings in the mode
With Vim keybindings on, `j`/`k` SHALL keep skipping and going back, `x` SHALL complete, `dd` SHALL trash, `:triage` SHALL enter the mode and `:q` SHALL leave it; the `?` overlay's Vim section SHALL list them.

#### Scenario: dd in the mode
- **WHEN** Vim keybindings are on and the user presses `d` twice on a task
- **THEN** the task is in the Trash and the next task is shown

#### Scenario: Enter by command
- **WHEN** the user runs `:tri` and accepts the completion
- **THEN** the triage mode opens on the first Inbox task

### Requirement: Scheduling sheet in triage
`s` in the triage mode SHALL open a scheduling sheet anchored to the card (a bottom sheet below 768 px) holding, in order:
1. when the task has a deadline, **relative choices** counted back from the deadline: On the deadline, 1 day before, 3 days before, 1 week before, 2 weeks before, 1 month before, each showing the do-on date it means in words in the user's date format, bound to the keys `1` to `6` in that order. A choice whose date is before the user's logical today SHALL be absent, and the remaining choices SHALL keep their keys. "1 month before" SHALL be the same day number one month earlier, or the last day of that month when it has no such day;
2. the quick choices of the Do on segment (Today, Tomorrow, This weekend, Next week), each with the date it means;
3. the same worded date field as the Do on segment, which previews what it understood before Enter;
4. the month calendar of the Do on segment, visible without opening anything, with the deadline day marked when the task has one.

Every date in the sheet SHALL follow the user's date format and week start (OpenSpec `date-time-preferences`). Choosing any option SHALL set the task's do-on date (and keep its time, evening flag and repeat rule as the Do on segment does), close the sheet, take the task out of the Inbox and advance, as one local operation batch that converges per field. Escape SHALL close the sheet without a write and keep the same task. While the sheet is open the triage decision keys SHALL not fire. Every choice SHALL be a button of at least 44 by 44 px, reachable with Tab and the arrow keys, and announced with its date.

#### Scenario: A week before the deadline
- **WHEN** today is 2026-10-21, the task has the deadline 2026-11-06, and the user presses `s` then `4`
- **THEN** the task's do-on date is 2026-10-30, its deadline is unchanged, it leaves the Inbox, and the next task is shown

#### Scenario: Choices in the past are left out
- **WHEN** today is 2026-10-21 and the task's deadline is 2026-10-24
- **THEN** the sheet offers On the deadline (Sat 24 Oct), 1 day before (Fri 23 Oct) and 3 days before (Wed 21 Oct) on `1`, `2` and `3`, and no week or month choice

#### Scenario: Month without the day
- **WHEN** the deadline is 2026-03-31 and the user picks 1 month before
- **THEN** the do-on date is 2026-02-28

#### Scenario: No deadline
- **WHEN** the task has no deadline and the user presses `s`
- **THEN** the sheet starts with the quick choices Today, Tomorrow, This weekend and Next week, and no relative row is shown

#### Scenario: User's date format
- **WHEN** the user's date format is month-day and the sheet shows the next Friday, 2026-10-23
- **THEN** every place in the sheet reads it in month-day order, as "Fri Oct 23", and never in another order

#### Scenario: Cancel
- **WHEN** the user presses `s`, then Escape
- **THEN** nothing is written, the sheet closes, and the same task is shown with focus on the card

#### Scenario: Offline
- **WHEN** the device is offline and the user schedules three tasks from the sheet
- **THEN** the three dates are visible at once, the tasks have left the Inbox, and the operations upload on the next sync

#### Scenario: Phone
- **WHEN** the mode is used 360 px wide and the user taps Schedule
- **THEN** the sheet opens from the bottom, every choice is visible without horizontal scrolling, and the keyboard is not opened until the date field is tapped

### Requirement: Inbox list and detail
From 1024 px of screen width the Inbox SHALL keep a detail pane beside its list, in the shell's panel slot, about half the content's width (at least 26 rem, at most 44 rem). The task under the list's cursor SHALL show in the pane, as the docked task of `web-app` "Task page" shows it, and SHALL follow the cursor: `j`, `k`, the arrow keys and a click on a row move the cursor and the pane shows that task. A click on a task's title SHALL show it in the pane instead of editing it in place. Enter on the cursor's row SHALL open the task as its page (`web-app` "Task page"), whose Back returns to the Inbox. Escape, the pane's Close and a click on the empty part of the list SHALL clear the cursor and empty the pane. While rows are ticked for a bulk action the pane SHALL stay empty, since ticking opens nothing; when the ticks clear, the cursor's task SHALL show again. With no task under the cursor the pane SHALL read "No task selected" with one sentence naming the ways on: select a task, or press `P` to process them, one at a time. An Inbox with no task SHALL show its empty state and no pane. Below 1024 px the Inbox SHALL be a plain list whose tasks open as their page. The pane SHALL only read and edit the task through the same operations as the task page, so it works offline and converges like any edit.

#### Scenario: The pane follows the cursor
- **WHEN** the Inbox holds "Book the dentist" and "Ideas for Mia's birthday" on a 1440 px screen and the user presses `j`, then `j` again
- **THEN** the pane shows "Book the dentist", then "Ideas for Mia's birthday", and focus stays on the list

#### Scenario: No task selected
- **WHEN** the user opens the Inbox with four tasks and nothing selected
- **THEN** the pane reads "No task selected" and "Select a task to decide where it goes, or press P to process all 4, one at a time."

#### Scenario: Enter opens the page
- **WHEN** the pane shows "Book the dentist" and the user presses Enter
- **THEN** the task opens at `/task/<id>` with "2 / 4", and Escape returns to the Inbox with that row selected

#### Scenario: Escape empties the pane
- **WHEN** the pane shows a task and the user presses Escape on the list
- **THEN** no row is selected and the pane reads "No task selected"

#### Scenario: Ticking opens nothing
- **WHEN** the pane shows a task and the user ticks it and the next row with `x` and Shift+Down
- **THEN** the pane reads "No task selected" while the two rows are ticked, and shows the cursor's task again after Escape clears the ticks

#### Scenario: Narrow screen
- **WHEN** the user presses Enter on a selected Inbox task in a 900 px wide window
- **THEN** the task opens as its page, and no pane is shown beside the Inbox

### Requirement: Inbox source lines
Each top-level task row of the Inbox SHALL carry a second line under its title, at the metadata size in the muted colour with an icon for its kind, saying where the task came from and when it was added: the source, a middle dot, and the time since its creation ("5 min ago", "2 h ago", "3 d ago", its date after a week). The source SHALL be read on the device from the task's origin when it has one ("From email", "From email (Gmail)" for a message opened in a web mail client, "From example.org" for a page, the issue's id such as "From acme/app#12", "Imported from todoist"), else from the device that wrote the task's creation ("From a calendar app" for a CalDAV app, "Added by an AI assistant" for an MCP agent or the in-app assistant, "Added through the API", "From a Markdown vault", "Imported"), else "Added". The line SHALL take the place of the origin item on Inbox rows; the task page and the docked task SHALL still show the origin with its link. Nothing SHALL be requested or written to show it, so it reads the same offline and on every device once the task has synced.

#### Scenario: A mail
- **WHEN** a task was created from an email to the Inbox address three days ago
- **THEN** its Inbox row reads "From email · 3 d ago" under the title, with the mail icon, and no origin item at the row's end

#### Scenario: A calendar app
- **WHEN** a task was created two hours ago in a calendar app through CalDAV
- **THEN** its Inbox row reads "From a calendar app · 2 h ago"

#### Scenario: Made in the app
- **WHEN** a task was typed into the Inbox's quick add five minutes ago
- **THEN** its row reads "Added · 5 min ago"
