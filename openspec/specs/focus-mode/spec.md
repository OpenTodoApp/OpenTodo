# focus-mode Specification

## Purpose
A Focus screen for working on one task at a time with a timer in one of three modes, a done state with an optional tone and a notification, break reminders after long stretches of work, and sessions logged as time entries where time tracking is available.

## Requirements

### Requirement: Focus screen
The app SHALL offer a Focus screen at `/focus` and `/focus/<task id>`, reachable from the command palette, the task panel's menu ("Focus on this task") and `g` then `Shift+F`. It SHALL show one open task: its title, project, due date, notes, subtasks as a checklist, and a large timer, with no task list on screen. It reads local rows only, works offline, and follows changes to the task from other devices as they sync; no op is written for showing it.

#### Scenario: Open from a task
- **WHEN** the user opens the menu of the task "Write the report" in its panel and picks "Focus on this task"
- **THEN** `/focus/<its id>` opens showing that task's title, notes and subtasks with the timer ready and not running

#### Scenario: Notes edited elsewhere
- **WHEN** the Focus screen shows a task and another device edits its notes, which sync
- **THEN** the notes on the Focus screen change without a reload and the timer keeps running

#### Scenario: Task completed elsewhere
- **WHEN** the shown task is completed or moved to the Trash on another device while a session runs
- **THEN** the session ends as if the task had been completed here, the done state names the task, and the next task of the focus list is offered

#### Scenario: Offline
- **WHEN** the device has no network connection
- **THEN** the Focus screen opens, a session starts, runs and finishes, and nothing is lost

### Requirement: Task selection
Without a task id in the address the Focus screen SHALL take the first open task of today's focus from the Daily check (`weekly-review`); when that list is empty it SHALL offer to choose a task with the smart picker over the user's open tasks. After a task is completed, or when the user picks "Next task", the screen SHALL move to the next open task of today's focus after the current one; when none is left it SHALL say the focus is done and offer the picker. Choosing a task writes nothing.

#### Scenario: From the focus list
- **WHEN** today's focus holds the tasks A, B and C and the user presses `g` then `Shift+F`
- **THEN** the Focus screen shows A, and completing A moves on to B

#### Scenario: Focus done
- **WHEN** C, the last task of today's focus, is completed on the Focus screen
- **THEN** the done state says today's focus is done and offers to choose another task

#### Scenario: No focus chosen
- **WHEN** no focus was chosen today and the user opens `/focus`
- **THEN** the screen offers the task picker, and in the Open Loops modes a link to the Daily check

#### Scenario: Task from the address
- **WHEN** the user opens `/focus/<id>` of an open task that is not in today's focus
- **THEN** that task is shown, and "Next task" after it offers the first open task of today's focus

#### Scenario: Unknown or closed task
- **WHEN** the address names a task that does not exist, is completed or is in the Trash
- **THEN** the screen says the task is not available and falls back to the focus list, without an error page

### Requirement: Timer modes
The Focus screen SHALL run the timer in one of three modes: Pomodoro (a work length, a short break, a long break after every N work sessions, with auto-start of breaks and of the next work session each optional), Flowtime (counts up without a limit until the user stops), and Countdown (a length chosen per session, no breaks). The mode in use SHALL be shown beside the title and switchable from the screen's menu while no session runs.

#### Scenario: Pomodoro cycle
- **WHEN** the mode is Pomodoro with 25 minute work, 5 minute short break, 15 minute long break every 4 sessions, and the user finishes the fourth work session
- **THEN** the break offered is the long break of 15 minutes, and after it the cycle count starts again at one

#### Scenario: Auto-start
- **WHEN** "Start breaks automatically" and "Start the next session automatically" are on
- **THEN** a finished work session goes into its break without a key press, and the finished break starts the next work session on the same task, each still shown as a done state for a moment and still announced

#### Scenario: Flowtime
- **WHEN** the mode is Flowtime and the user starts
- **THEN** the timer counts up from 0:00 with no end, and Space pauses it, and the "Done" action ends the session with the time worked shown in the done state

#### Scenario: Countdown length
- **WHEN** the mode is Countdown and the user starts a session
- **THEN** the screen asks for the length first (5 to 180 minutes, the last length on this device preselected) and counts down from it

#### Scenario: Switching modes mid-session
- **WHEN** a session runs
- **THEN** the mode items of the menu are disabled with the reason that a session is running

### Requirement: Session controls
Space SHALL start or pause the session, Enter SHALL complete the task (ending the session), Esc SHALL leave the screen for the previous view (the session keeps running), `b` SHALL take a break now or end the current break, and `n` SHALL move to the next task. Every one of these SHALL also be a visible button. The same keys SHALL be listed in the cheat sheet and the keyboard guide from the registry.

#### Scenario: Start and pause
- **WHEN** the user presses Space twice with two seconds between
- **THEN** the timer runs for two seconds and stops, shows "Paused", and the button reads "Resume"

#### Scenario: Complete the task
- **WHEN** a session runs and the user presses Enter
- **THEN** the task is completed through the usual completion (with its "complete parent too?" and recurrence behaviour), the session ends, and the done state shows the time worked

#### Scenario: Leave and come back
- **WHEN** a session runs and the user presses Esc, works in the Inbox for five minutes, then presses `g` then `Shift+F`
- **THEN** the previous view is shown after Esc, and the Focus screen comes back with the same task and the timer five minutes further on

#### Scenario: Typing is not intercepted
- **WHEN** focus is in the notes or a subtask title and the user presses Space
- **THEN** a space is typed and the timer does not change

### Requirement: Timer accuracy
The timer SHALL measure elapsed time from the clock, not by counting ticks, so a throttled or hidden tab, a laptop that slept, or a reload shows the right remaining time and a session that ended while the tab was hidden is shown as done when the tab returns.

#### Scenario: Tab hidden through the end
- **WHEN** a 25 minute session runs, the tab stays hidden for 30 minutes, and the user returns
- **THEN** the screen shows the done state with 25:00 worked, not a timer still running

#### Scenario: Reload
- **WHEN** the page is reloaded ten minutes into a session
- **THEN** the Focus screen shows the same task with the timer at ten minutes and running

### Requirement: Done state and tone
When a work session or a break ends the screen SHALL show a done state naming what ended, the time worked, and the next step (start the break, start the next session, complete the task, next task). When the user has turned the sound on it SHALL play a short tone generated on the device, never an audio file, once per session end, and only while the tab is visible.

#### Scenario: Sound off by default
- **WHEN** a session ends on a fresh account
- **THEN** no sound is played, and Settings → General → Focus shows the sound off

#### Scenario: Sound on
- **WHEN** the user turned the sound on and a session ends while the tab is visible
- **THEN** a short tone plays once and the done state is shown

#### Scenario: Done state content
- **WHEN** the second Pomodoro work session of 25 minutes ends
- **THEN** the done state reads that the session is done with 25:00 worked and offers "Start the break", "Complete the task" and "Next task"

### Requirement: Session end notification
When a session or break ends while the tab is hidden and the browser permission for notifications is granted, the app SHALL show a system notification through the service worker, at most one per session end, naming the task, and clicking it SHALL open the Focus screen. No notification is attempted without the permission, and none is sent through the server.

#### Scenario: Hidden tab
- **WHEN** a session ends while the tab is hidden and notifications are allowed
- **THEN** a system notification "Session done" names the task, and clicking it brings the app to the Focus screen; the tone, when on, plays when the tab is shown again, not in the background

#### Scenario: Permission denied
- **WHEN** notifications are not allowed and a session ends while the tab is hidden
- **THEN** no notification is attempted and the done state is there when the tab returns

#### Scenario: Two tabs
- **WHEN** the Focus screen is open in two tabs of the same browser and the session ends
- **THEN** both show the done state and at most one system notification is shown

### Requirement: Sessions are time entries
Where time tracking (`time-tracking`, collection `time_entries`) is present, starting a work session SHALL start a time entry on the task, pausing SHALL end it and resuming SHALL start a new one (time tracking has no paused entry: each stretch of work is one entry), and completing the task, leaving the session, ending a Flowtime session or starting a break SHALL stop it; breaks SHALL never be logged. The entries are ordinary ops: written offline through the outbox and converging per field. When time cannot be logged the timer SHALL work the same and write nothing.

#### Scenario: Session logged
- **WHEN** time tracking is present and the user runs a 25 minute session on "Write the report", then completes it
- **THEN** the task has one time entry of 25 minutes started when the session started, and another device shows it after sync

#### Scenario: Pause is not work
- **WHEN** the user pauses for ten minutes in the middle of a session and resumes
- **THEN** no time entry covers the ten minutes: the pause ended the session's entry and resuming started a second one, as the time-tracking capability records each stretch of work

#### Scenario: Break not logged
- **WHEN** a Pomodoro work session ends and its break runs for five minutes
- **THEN** no time entry covers the break

#### Scenario: Degraded without time tracking
- **WHEN** time cannot be logged on the device (the time-tracking capability is not available)
- **THEN** sessions start, pause and end exactly as above, the done state shows the time worked, and no op is written for the session

#### Scenario: Entry stopped elsewhere
- **WHEN** another device stops the running time entry of the session, which syncs
- **THEN** the Focus screen shows the session as paused with the reason, and Space starts a new entry

### Requirement: Break reminder
A break reminder SHALL be a personal setting, off by default, with a length in minutes (default 90). While it is on and a work session has run for that long of continuous tracked work, the app SHALL show a notice on every screen offering "Take a break", which ends the session's work (stopping its entry) and starts a break, and "Not now", which dismisses it for the same length again. Pauses do not count as work; a break resets the count.

#### Scenario: Off by default
- **WHEN** a user who never changed the setting works for three hours in Flowtime
- **THEN** no reminder is shown

#### Scenario: Reminder after 90 minutes
- **WHEN** the reminder is on at 90 minutes, a Flowtime session has run 90 minutes without a break, and the user is in the Inbox
- **THEN** the notice appears there with "Take a break" and "Not now", reachable from the keyboard

#### Scenario: Take a break
- **WHEN** the user picks "Take a break"
- **THEN** the session's time entry stops, the Focus screen (when shown) runs the short break, and the count starts again after the break

#### Scenario: Not now
- **WHEN** the user picks "Not now" at 90 minutes
- **THEN** the notice closes and comes back at 180 minutes of continuous work

### Requirement: Timer state stays on the device
The running session (task, mode, phase, start time, time accumulated before a pause, cycle count, countdown length) SHALL be stored in the device's local store so it survives a reload and a closed tab, SHALL never be synced, exported or sent to the server, and SHALL be cleared on sign-out. Two devices never share a session, so there is nothing to converge; the time entry is what other devices see.

#### Scenario: Closed tab
- **WHEN** the user closes the tab during a session and opens the app again an hour later
- **THEN** the Focus screen shows the session as ended (a timed session) or as still counting (Flowtime), as the clock says, and offers the done state

#### Scenario: Not in the export
- **WHEN** the user exports their data during a session
- **THEN** the export holds the time entry, when time tracking is present, and nothing about the running timer

#### Scenario: Another device
- **WHEN** a session runs on the laptop and the user opens the Focus screen on the phone
- **THEN** the phone shows no running session; the laptop's entry is visible on the task after sync

### Requirement: Focus preferences
The mode, the work, short break and long break lengths, the long-break cycle count, the two auto-start switches, the break reminder and its length, and the sound SHALL be personal preferences edited in Settings → General → Focus and, for the mode, from the Focus screen. An unknown or missing value reads as the default; a value outside its range is refused before it is stored.

#### Scenario: Defaults
- **WHEN** a user opens Settings → General → Focus for the first time
- **THEN** it shows Pomodoro, 25, 5 and 15 minutes, a long break every 4, both auto-starts off, the break reminder off at 90 minutes, and the sound off

#### Scenario: Unknown mode from a newer client
- **WHEN** a newer client stores a mode this client does not know
- **THEN** this client runs Pomodoro and keeps the stored value unchanged

#### Scenario: Bounds
- **WHEN** the user types 0 or 400 as the work length
- **THEN** the field refuses it with the allowed range (1 to 180 minutes) and the stored value is unchanged

### Requirement: Focus preferences sync
The focus preferences SHALL be stored as additive fields on the user's synced preferences row: they carry no content, sync to the user's devices only, are written offline through the outbox and converge per field by last-writer-wins, and are included in the export like the other preferences.

#### Scenario: Synced to the phone
- **WHEN** the user sets the work length to 50 minutes on the laptop and later opens the Focus screen on the phone
- **THEN** the phone's next Pomodoro session is 50 minutes

#### Scenario: Concurrent edits
- **WHEN** the laptop sets the mode to Flowtime and the phone sets the work length to 30 minutes, both offline, then both sync
- **THEN** every device shows Flowtime with a 30 minute work length

### Requirement: Accessible timer
The timer SHALL be announced to assistive technology politely at intervals, not every second: when a session starts or resumes, every five minutes, at one minute left, and when it ends; the done state SHALL be announced once and move focus to its first action. The digits SHALL use tabular figures, meet the contrast requirement in both themes, and the screen SHALL respect reduced motion.

#### Scenario: Announcements
- **WHEN** a screen reader user starts a 25 minute session
- **THEN** "25 minutes left" is announced at the start, then at 20, 15, 10 and 5 minutes, "1 minute left", and "Session done" at the end, and nothing in between

#### Scenario: Done state focus
- **WHEN** a session ends while the Focus screen is shown
- **THEN** focus moves to the first action of the done state, unless the user is typing in a field

### Requirement: Focus screen layout
The Focus screen SHALL use the page template with its title, the mode as the header's secondary text, at most two visible actions and an overflow menu holding the mode, "Change task", Settings and Help; the content column is the only scroll region; the timer and the task fit a 360 px wide screen without horizontal scrolling. It adds no sidebar destination.

#### Scenario: Phone width
- **WHEN** the Focus screen is shown on a 360 px wide screen with a task that has long notes
- **THEN** the timer, its buttons, the title and the notes are shown in one column and only the content column scrolls

#### Scenario: Menu
- **WHEN** the user opens the header's menu
- **THEN** it lists Pomodoro, Flowtime and Countdown with the current one checked, "Change task", Settings and Help
