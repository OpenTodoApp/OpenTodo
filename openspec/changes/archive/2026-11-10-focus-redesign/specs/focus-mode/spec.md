## ADDED Requirements

### Requirement: Today's sessions
The Focus screen's menu SHALL offer "Today's sessions", which opens a sheet (a popover from 768 px) listing the time entries of the user's logical today that were written by the Focus screen (a set `focus_mode`), newest first. Each line SHALL show the start time, the task's title, the mode and the length, and the sheet SHALL start with the count and the total. It reads local rows only, writes nothing, works offline and shows the same on every device once the entries have synced. With no session today it SHALL show one sentence and no action.

#### Scenario: Three sessions
- **WHEN** the user ran two 25-minute Pomodoro sessions on "Write the report" and a 40-minute Flowtime session on "Inbox zero" today and opens Today's sessions
- **THEN** the sheet reads "3 sessions · 1 h 30 min" and lists the three with their start times, newest first

#### Scenario: Other time entries are not sessions
- **WHEN** the user also tracked 20 minutes on a task from its Time tab today
- **THEN** that entry is not in Today's sessions

#### Scenario: Offline
- **WHEN** the device is offline and the user opens Today's sessions
- **THEN** the sheet lists the sessions from local rows

## MODIFIED Requirements

### Requirement: Focus screen
The app SHALL offer a Focus screen at `/focus` and `/focus/<task id>`, reachable from the command palette, the task panel's menu ("Focus on this task") and `g` then `Shift+F`. It SHALL show one open task as one centred stage, in this order:
1. the task's project, small and muted;
2. its title, large, clamped to three lines with the whole title in its accessible name;
3. its next open subtask as one line that can be ticked, when it has one;
4. a large timer;
5. one state line naming the mode where it matters, the phase and the cycle position;
6. the session's controls.

The notes and the full subtask checklist SHALL be behind one "Notes and subtasks" disclosure under the controls, closed by default, its state remembered on the device only. There SHALL be no task list, no card around the timer and no printed shortcut line on screen (unless the user's "Show shortcut hints" preference is on). It reads local rows only, works offline, and follows changes to the task from other devices as they sync. No op is written for showing it.

#### Scenario: Open from a task
- **WHEN** the user opens the menu of the task "Write the report" in its panel and picks "Focus on this task"
- **THEN** `/focus/<its id>` opens showing that task's project and title, its next open subtask, and the timer ready and not running, with the notes behind "Notes and subtasks"

#### Scenario: Notes edited elsewhere
- **WHEN** the Focus screen shows a task with "Notes and subtasks" open, and another device edits its notes, which sync
- **THEN** the notes on the Focus screen change without a reload and the timer keeps running

#### Scenario: Task completed elsewhere
- **WHEN** the shown task is completed or moved to the Trash on another device while a session runs
- **THEN** the session ends as if the task had been completed here, the done state names the task, and the next task of the focus list is offered

#### Scenario: Offline
- **WHEN** the device has no network connection
- **THEN** the Focus screen opens, a session starts, runs and finishes, and nothing is lost

#### Scenario: Tick the next subtask
- **WHEN** the stage shows the next subtask "Collect the merged PRs" and the user ticks it
- **THEN** the subtask is completed with Undo, the stage shows the following open subtask, and the timer keeps running

#### Scenario: Disclosure remembered
- **WHEN** the user opens "Notes and subtasks", leaves Focus and opens it again on another task on the same device
- **THEN** the disclosure is open

### Requirement: Focus screen layout
The Focus screen SHALL use the page template with the title "Focus", no secondary text, no visible header action other than its overflow menu, and an overflow menu holding the mode, "Change task", the noise toggle, "Today's sessions", Settings and Help. Start, Pause, Resume, Complete, Take a break, End the break, Stop and Next task SHALL be on the stage under the timer, with exactly one of them as the primary button. The content column is the only scroll region. The stage SHALL be centred, vertically too from 768 px, and the timer and the task fit a 360 px wide screen without horizontal scrolling. It adds no primary sidebar destination by default: Focus is listed in the More group, and becomes a primary destination only when the user promotes it.

#### Scenario: Phone width
- **WHEN** the Focus screen is shown on a 360 px wide screen with a task that has long notes and "Notes and subtasks" open
- **THEN** the title, the timer, its controls and the notes are shown in one column and only the content column scrolls

#### Scenario: Menu
- **WHEN** the user opens the header's menu
- **THEN** it lists Pomodoro, Flowtime and Countdown with the current one checked, "Change task", "Noise on" (or "Noise off" while noise is chosen), "Today's sessions", Settings and Help

#### Scenario: Not a primary destination by default
- **WHEN** a user who promoted nothing opens the app
- **THEN** Focus is listed in the More group and not among the primary destinations

#### Scenario: One title
- **WHEN** a Pomodoro session runs
- **THEN** the header reads "Focus" alone, and the state line under the timer reads "Pomodoro · Work · 2 of 4"

#### Scenario: A break is the same stage
- **WHEN** a work session ends and the short break starts
- **THEN** the stage stays, the title is dimmed, the timer counts the break, the state line reads "Short break", the primary button reads "End the break", and no other screen or dialog opens

### Requirement: Done state and tone
When a work session or a break ends, the stage SHALL show a done state in place of the running timer and its controls. It SHALL name what ended, show the time worked, and offer exactly one primary next step:
- after work: start the break;
- after a break: start the next session;
- after the task was completed: choose another task.

The other next steps (complete the task, next task, and Extend while it applies) SHALL be quiet buttons on the same row.

When the user has chosen a sound, it SHALL play a tone generated on the device, never an audio file, once per session end, and only while the tab is visible:
- Short plays the short tone once.
- Long plays a louder tone about once a second until the user clicks, taps or presses a key in the app, the tab is hidden, or 10 seconds pass.

While Long plays on a device that can vibrate and haptics are on, each repeat also vibrates.

#### Scenario: Sound off by default
- **WHEN** a session ends on a fresh account
- **THEN** no sound is played, and Settings → General → Focus shows the sound Off

#### Scenario: Sound on
- **WHEN** the user chose Short and a session ends while the tab is visible
- **THEN** a short tone plays once and the done state is shown

#### Scenario: Long until acknowledged
- **WHEN** the user chose Long and a session ends while the tab is visible
- **THEN** the tone repeats about once a second, louder than Short, and stops at the user's first click, tap or key press

#### Scenario: Long stops on its own
- **WHEN** the user chose Long and nobody touches the device after a session ends
- **THEN** the tone stops after 10 seconds

#### Scenario: Done state content
- **WHEN** the second Pomodoro work session of 25 minutes ends
- **THEN** the stage reads that the session is done with 25:00 worked, "Start the break" is the primary button, and "Complete the task", "Next task", "+5 min" and "+15 min" are quiet buttons beside it
