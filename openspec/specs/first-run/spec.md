# first-run Specification

## Purpose
Defines what a person sees the first time they sign in on a server: a short in-app start that produces a first task, a chosen appearance and an understanding of where things are, without a tour overlay.

## Requirements

### Requirement: Three-step first run
The first time an account opens the app, the Inbox SHALL show its ordinary page (header, quick add, the rows or the empty view) and, over it, a **start guide** with three steps, one at a time:
1. Add your first task: a quick add inside the step (the same quick add as the Inbox's), focused, with one example; the task lands in the Inbox behind the guide, and adding one moves the guide on.
2. How do you want to work: Lists only, Companion or Open Loops first, each with one sentence and a "Learn the method" link that opens the method overview in the Help panel. Companion is preselected. Light, dark or system follows as a second row of the same step.
3. Install the app, or skip.

The guide SHALL be a centred dialog from 640 px up and a bottom sheet below it, leaving the Inbox visible behind, and SHALL never be a row of the list. Each step SHALL be skippable, and the guide SHALL be closable at any step in every way an overlay closes (Close, Escape, a tap on the scrim, "Skip all"); closing it in any way counts as finishing it. Skipping or closing on the second step SHALL leave the "How you work" preference unwritten, so it reads as `lists`. Finishing, in any way, SHALL be stored with the account's preferences as an ordinary operation, so the guide never returns on its own on that account, on a second device after sync included. The guide SHALL open only after the owner's welcome note, when that is shown, has been closed, and SHALL never open on a demo instance. Choosing Companion or Open Loops first SHALL show the starter setup offer of the `open-loops` capability. Choosing Open Loops first SHALL offer to open on the Loop home on this device. The guide SHALL work offline: its only writes are the operations above, which converge by last-writer-wins.

Settings → Account → How you work SHALL end with a "Start guide" row: its title, one line naming what the guide covers ("Add a first task, choose how you work, install the app"), its state ("Finished" or "Not finished", from the synced `first_run` preference), and an "Open the start guide" button. The button SHALL go to the Inbox and open the guide there at its first step, on this device, without writing anything until a step writes; closing it SHALL return nowhere else and write nothing. The row SHALL follow the card's row layout (label and description on the left, the action on the right) and SHALL be reachable with Tab.

#### Scenario: Complete the first run
- **WHEN** a new owner adds a task, picks Companion, declines the starter labels, picks dark and skips installing
- **THEN** the guide closes, the task is in the Inbox behind it the whole time, the preference is `companion`, the app is dark, and reopening the app on another device after sync shows no guide

#### Scenario: Open Loops first from the start
- **WHEN** a new user picks Open Loops first and accepts the starter labels and the Loop home as start view
- **THEN** the sidebar shows the Open Loops destinations, the four context labels exist, and the next launch on this device opens the Loop home

#### Scenario: Skip all
- **WHEN** the user activates Skip all on the first step
- **THEN** the guide closes for good, the Inbox's empty view is shown, and the preference reads `lists`

#### Scenario: Closed with Escape
- **WHEN** the user presses Escape on the second step without choosing
- **THEN** the guide closes, the preference reads `lists`, and it does not return on any device of the account

#### Scenario: Learn before choosing
- **WHEN** the user activates "Learn the method" on the second step
- **THEN** the method overview opens in the Help panel and the guide keeps its step and the task already added

#### Scenario: On a phone
- **WHEN** a new account opens the Inbox on a 390×844 screen
- **THEN** the guide is a sheet at the bottom of the screen with one step, the page header and the Inbox are visible above it, and the sheet is at most two thirds of the screen high

#### Scenario: After the welcome note
- **WHEN** a new owner opens a fresh server
- **THEN** the welcome note is shown first, and the start guide opens after it is closed

#### Scenario: Shown again from Settings
- **WHEN** a user who finished the guide opens Settings → Account → How you work and activates "Open the start guide" in the "Start guide" row, which reads "Finished"
- **THEN** the Inbox opens with the guide at its first step over it, adding a task there puts it in the Inbox behind the guide, and closing the guide writes nothing

#### Scenario: Not finished yet
- **WHEN** a user who closed the welcome note but has not finished the guide opens How you work
- **THEN** the "Start guide" row reads "Not finished" and its button opens the guide over the Inbox

### Requirement: Welcome note for the owner
The first time the owner opens a server whose owner account was created in the last seven days and has no task yet, the app SHALL show a dialog thanking them for installing OpenTodo, with a link to open an issue on GitHub, a link to join the OpenTodo Discord server, a link to star the repository, a Buy Me a Coffee button and one primary button that closes it. Every link SHALL open in a new tab and SHALL load nothing from the linked site into the app. Closing the dialog in any way SHALL record the preference `welcome` as `seen` through the op log, and the dialog SHALL never show again on any device of that account. It SHALL NOT show to members, on a demo instance, or for an account that already had tasks when the app opened or is older than seven days. The same links SHALL be available in Help and in Settings → About, where the owner can open the note again.

#### Scenario: New server
- **WHEN** the owner creates the owner account on a new server and the app opens
- **THEN** the dialog "Thanks for installing OpenTodo" is shown with the issue, Discord, star and coffee links, and after "Start using OpenTodo" it is gone, also after a reload and on the owner's phone after sync

#### Scenario: Discord link in the note
- **WHEN** the owner activates the Discord row of the welcome note
- **THEN** the Discord invite opens in a new tab, the note stays open, and the app has made no request to Discord before or after the activation

#### Scenario: Invited member
- **WHEN** a member invited by the owner signs in for the first time
- **THEN** no welcome dialog is shown

#### Scenario: Upgraded server
- **WHEN** the owner of a server that already has tasks upgrades to a version with the welcome note
- **THEN** no welcome dialog is shown

### Requirement: Sample tasks
The start guide's first step SHALL offer "Start with three sample tasks" beside its quick add. Choosing it SHALL create three tasks in the Inbox as ordinary operations on the device, each marked with the additive task field `sample` (true): one that explains the task panel in its notes, one due today at 10:00 with a 15-minute estimate, and one with a subtask. No label, project or other entity SHALL be created. The tasks SHALL sync, edit, complete and trash like any task, and SHALL converge by last-writer-wins per field like any task. A sample task's row SHALL show the muted word "Sample" in its metadata line and its panel SHALL show a one-line notice with "Remove sample tasks". "Remove sample tasks", offered in that notice, in the Inbox header's overflow while a sample task exists, and in the first-day checklist, SHALL trash every task still marked `sample`, open or completed, as ONE batch with the usual Undo toast. Sample tasks, open or completed, SHALL be excluded from Statistics, the Loop pulse and the weekly digest through the marker; completing one SHALL keep the marker. The offer SHALL appear once per account: after it is taken, or after the guide is finished, the first step SHALL not offer it again, on any device.

#### Scenario: Take the offer
- **WHEN** a new user activates "Start with three sample tasks" on the guide's first step
- **THEN** the Inbox behind the guide shows three tasks each marked "Sample", one due today at 10:00 with 15 m, one with a subtask, and the guide moves to its second step

#### Scenario: Remove in one tap
- **WHEN** the user has completed one sample task, edited another's title and activates "Remove sample tasks" in the Inbox header's overflow
- **THEN** all three go to the Trash as one batch, the toast reads "3 sample tasks removed" with Undo, and Undo restores all three with the edited title

#### Scenario: Never counted
- **WHEN** the user completes the sample task due today and opens Statistics, the Loop home and, the next week, receives the digest
- **THEN** none of them counts that completion, and the Loop pulse's completed-per-day shows nothing for it

#### Scenario: Offline and across devices
- **WHEN** the offer is taken on the phone while offline and the laptop later syncs
- **THEN** the laptop shows the three tasks marked "Sample", and removing them on the laptop empties the phone's Inbox of them after its next sync

#### Scenario: Older server
- **WHEN** the device syncs the sample tasks with a server that does not know `sample`
- **THEN** the field's operations are rejected as unknown, the tasks themselves sync as ordinary tasks, and the device keeps showing them as samples

#### Scenario: Offered once
- **WHEN** a user who took the offer reopens the start guide from Settings
- **THEN** the first step shows its quick add and no sample offer

### Requirement: First-day checklist
After the start guide's third step, the guide SHALL show a last view, "Your first day", with three steps whose done state is read from local data and never written: "Add a task" (a task not marked `sample` exists), "Plan today" (a task has a due date the user set, or Today was opened after the first task), and "Get it on another device" (the app is installed on this device, or the account's sync state shows a second device). Each step SHALL name one action that leads to it, and the view SHALL offer "Remove sample tasks" while any sample task exists. Until every step is done, the sidebar's More group SHALL list "Start guide" with "n of 3 done", which opens this view, with "Hide" in its menu; the entry SHALL leave when all three are done or when hidden. Hiding SHALL write the additive preference `start_checklist` as `hidden` through the operation log, so no device of the account shows the entry again; it SHALL converge by last-writer-wins and SHALL be written offline through the outbox. The entry SHALL never be a primary sidebar destination and SHALL never appear on a demo instance.

#### Scenario: Steps tick from data
- **WHEN** a new user added "Call the dentist" and gave it tomorrow's date, and has not installed the app
- **THEN** the More group reads "Start guide · 2 of 3 done" and the view shows the third step open with "Install the app" as its action

#### Scenario: Done
- **WHEN** the user installs the app on the device
- **THEN** the third step is done, the More entry is gone on this device, and nothing was written for it

#### Scenario: Hide
- **WHEN** the user chooses Hide in the entry's menu on the laptop while offline, then both devices sync
- **THEN** the entry is gone on the laptop at once and on the phone after sync, and `start_checklist` reads `hidden` in the export

#### Scenario: Second device counts
- **WHEN** the user signs in on their phone and it syncs
- **THEN** the laptop's third step is done the next time the laptop syncs
