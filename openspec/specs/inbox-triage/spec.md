# inbox-triage Specification

## Purpose
A focused mode that walks the Inbox one task at a time with single-key decisions, so a captured list can be processed to empty from the keyboard, offline, without opening each task.

## Requirements

### Requirement: Entering and leaving the triage mode
The client SHALL offer a triage mode for the Inbox, entered with `g` then `p`, with a "Process" control in the Inbox header that shows the number of open Inbox tasks, and with the Vim command `triage`. The mode SHALL show one open Inbox task at a time: its title, its notes read-only, and its due date, labels and reminders if any. Escape SHALL return to the Inbox with the current task selected. When the Inbox has no open task the mode SHALL show an empty state with the way back.

#### Scenario: Enter with the chord
- **WHEN** focus is not in a text field and the user presses `g` then `p`
- **THEN** the triage mode opens on the first open Inbox task, showing its title and notes

#### Scenario: Leave with Escape
- **WHEN** the user is on the fourth task and presses Escape
- **THEN** the Inbox list opens with that task selected

#### Scenario: Empty Inbox
- **WHEN** the mode is opened with no open task in the Inbox
- **THEN** it shows an "Inbox zero" state with a control that returns to the Inbox, and no decision key does anything

### Requirement: Queue and progress
The queue SHALL be the open top-level Inbox tasks in the Inbox's manual order when the mode opens. Tasks that become open Inbox tasks meanwhile SHALL join its end; a task that stops being one (on any device) SHALL leave it. The mode SHALL show "n of N", N being the queue length and n the position; a decision or skip advances, `k` returns to the previous task, and after the last task the empty state is shown.

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

### Requirement: Decisions that advance
In the mode, `t` SHALL set the task's due date to today, `c` SHALL complete it, Delete (or Backspace) SHALL move it to the Trash, and `j` or Space SHALL skip it; each SHALL advance to the next task. Enter SHALL open the full detail panel over the card and Escape from the panel SHALL return to the card. Each decision SHALL be exactly the operation the list or detail panel writes for the same action, so it is applied locally first and converges by last-writer-wins.

#### Scenario: Today
- **WHEN** the user presses `t` on an undated task
- **THEN** the task is due today, stays in the Inbox, and the next task is shown

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
`s` SHALL open the date field with its calendar popover; `m` SHALL open the project picker; `a` SHALL open a delegate picker of every person assignable in a project the user shares, each entry naming person and project. Confirming SHALL apply the change and advance; Escape SHALL cancel and stay. Delegating SHALL move the task into that project and assign it in one operation set. Decision keys SHALL not fire while a picker or field has focus.

#### Scenario: Schedule with a typed date
- **WHEN** the user presses `s`, types `fri` and presses Enter
- **THEN** the task is due next Friday and the next task is shown

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
