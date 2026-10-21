## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Entering and leaving the triage mode
The client SHALL offer a triage mode for the Inbox, entered with `g` then `p`, with a "Process" control in the Inbox header that shows the number of open Inbox tasks, and with the Vim command `triage`. The mode SHALL show one open Inbox task at a time: its title, its notes read-only, and its due date, labels and reminders if any. Escape SHALL return to the Inbox with the current task selected. When the Inbox has no Inbox task the mode SHALL show the Inbox zero state: the Inbox zero illustration (OpenSpec `design-system`, "Illustrations") above the text "Inbox zero: every task has a place." and the way back. The Process control and the mode SHALL count Inbox tasks as OpenSpec `project-organization` defines them.

#### Scenario: Enter with the chord
- **WHEN** focus is not in a text field and the user presses `g` then `p`
- **THEN** the triage mode opens on the first open Inbox task, showing its title and notes

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
