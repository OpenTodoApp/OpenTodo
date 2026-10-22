# Spec Delta

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Sample project
**Reason**: Six tasks in a project taught six things at once and needed a project to be trashed; three marked tasks teach one thing each, leave in one tap and never distort a week's numbers.
**Migration**: The offer becomes "Start with three sample tasks" on the guide's first step ("Sample tasks" above). Projects named "Show me around" that already exist are ordinary projects and are left alone; the walkthrough of a date, a deadline, labels, a repeat and notes moves to the user guide.
