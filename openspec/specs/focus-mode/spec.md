# focus-mode Specification

## Purpose
A Focus screen for working on one task at a time with a timer in one of three modes, a done state with an optional tone and a notification, break reminders after long stretches of work, and sessions logged as time entries where time tracking is available.

## Requirements

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
When a work session or a break ends, the stage SHALL show a done state in place of the running timer and its controls. It SHALL name what ended, show the time worked, and offer exactly one primary next step:
- after work: start the break;
- after a break: start the next session;
- after the task was completed: choose another task.

The other next steps (complete the task, next task, and Extend while it applies) SHALL be quiet buttons on the same row.

When the user has chosen a sound, it SHALL play a tone generated on the device, never an audio file, once per session end on the device, however many tabs show the app:
- Short plays the short tone once.
- Long plays a louder tone about once a second until the user clicks, taps or presses a key in the app, the tab is hidden, or 10 seconds pass.

While Long plays on a device that can vibrate and haptics are on, each repeat also vibrates.

In a browser, outside the native apps, a tab that is hidden when a timed session or break ends SHALL play the sound at the planned end, timed by the audio clock and not by timers the browser throttles, when that tab's audio was started by a gesture in it (the Start of the session) and still runs. In the background, Long repeats until the tab is shown again, the user clicks, taps or presses a key in another tab of the app, the sound is turned off, or 10 seconds pass. A sound played in the background SHALL NOT be played again when the tab is shown; when the tab's audio did not run, the tone SHALL play when the tab is shown again. A tab closed, discarded or frozen before the end SHALL leave the end to the tabs that remain, which ring it on return. This is device-local: nothing is written or synced, and it works offline.

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

#### Scenario: Hidden tab on a computer
- **WHEN** the user chose Short, starts a 25 minute session in a desktop browser and hides the tab behind a fullscreen video, and the browser runs the tab's timers once a minute
- **THEN** the tone plays at 25:00, not up to a minute later, and does not play again when the user returns to the tab

#### Scenario: Long in a hidden tab
- **WHEN** the user chose Long and the session ends while the tab is hidden
- **THEN** the tone repeats about once a second and stops when the user shows the tab again, presses a key or clicks in another tab of the app, or after 10 seconds

#### Scenario: Paused before the end
- **WHEN** the tab is hidden and the session is paused on another device before its end
- **THEN** no tone plays at the planned end on this device

#### Scenario: Two tabs
- **WHEN** the app is open in two tabs of the same browser, both hidden or one visible, and the session ends
- **THEN** the tone plays once

#### Scenario: Tab closed before the end
- **WHEN** two tabs of the app are hidden, the one that started the session is closed before the end, and the session ends
- **THEN** no tone plays in the background, and the tone plays once when the other tab is shown

#### Scenario: Audio not running
- **WHEN** the tab's audio was never started in it, or the browser suspended it in the background, and the session ends while the tab is hidden
- **THEN** no tone plays in the background, and the tone plays once when the tab is shown again

### Requirement: Session end notification
When a session or break ends while the tab is hidden and the browser permission for notifications is granted, the app SHALL show a system notification through the service worker, at most one per session end, naming the task, and clicking it SHALL open the Focus screen. No notification is attempted without the permission, and none is sent through the server. When the sound plays in a hidden tab at the planned end, the notification SHALL be shown with it, not when the browser's throttled timers next run.

#### Scenario: Hidden tab
- **WHEN** a session ends while the tab is hidden and notifications are allowed
- **THEN** a system notification "Session done" names the task, and clicking it brings the app to the Focus screen; the tone, when on, plays at the end where the tab's audio runs, and otherwise when the tab is shown again

#### Scenario: Permission denied
- **WHEN** notifications are not allowed and a session ends while the tab is hidden
- **THEN** no notification is attempted and the done state is there when the tab returns

#### Scenario: Two tabs
- **WHEN** the Focus screen is open in two tabs of the same browser and the session ends
- **THEN** both show the done state and at most one system notification is shown

### Requirement: Sessions are time entries
Where time tracking (`time-tracking`, collection `time_entries`) is present, starting a work session SHALL start a time entry on the task, pausing SHALL end it and resuming SHALL start a new one (time tracking has no paused entry: each stretch of work is one entry), and completing the task, leaving the session, ending a Flowtime session or starting a break SHALL stop it; breaks SHALL never be logged. The entries are ordinary ops: written offline through the outbox and converging per field. Pausing or ending a session on a device other than the one that started its entry SHALL stop that entry the same way. When time cannot be logged the timer SHALL work the same and write no time entry, and the failure SHALL be reported in a toast: a start failure says the session is not being tracked, a stop failure says the minutes may not be logged correctly, and each names the underlying error.

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
- **THEN** sessions start, pause and end exactly as above, the done state shows the time worked, and no time entry is written; the session itself still syncs as "Session syncs across the user's devices" says

#### Scenario: Entry stopped elsewhere
- **WHEN** another device stops the running time entry of the session from time tracking, which syncs
- **THEN** the Focus screen shows the session as paused with the reason, and Space starts a new entry

#### Scenario: Paused on another device
- **WHEN** a session started on the laptop runs and the user pauses it on the phone
- **THEN** the phone ends the laptop's running entry at the pause, and after sync both devices show the session paused with no running entry

#### Scenario: Start failure is shown
- **WHEN** the time entry cannot be started but the work session starts
- **THEN** the timer runs, the session has no entry, and a toast says the session is not being tracked

#### Scenario: Stop failure is shown
- **WHEN** the session's time entry cannot be stopped when the session pauses or ends
- **THEN** the session changes as usual and a toast says the minutes may not be logged correctly

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

### Requirement: Focus preferences
The mode, the work, short break and long break lengths, the long-break cycle count, the two auto-start switches, the break reminder and its length, and the sound (Off, Short or Long) SHALL be personal preferences edited in Settings → General → Focus and, for the mode, from the Focus screen. An unknown or missing value reads as the default; a value outside its range is refused before it is stored. The sound is stored as the on/off `focus_sound` and the length `focus_alert`, so a client that knows only `focus_sound` plays the short tone where Long was chosen. Preferences apply on the device at once, offline included, and converge across devices per field by last-writer-wins.

#### Scenario: Defaults
- **WHEN** a user opens Settings → General → Focus for the first time
- **THEN** it shows Pomodoro, 25, 5 and 15 minutes, a long break every 4, both auto-starts off, the break reminder off at 90 minutes, and the sound Off

#### Scenario: Unknown mode from a newer client
- **WHEN** a newer client stores a mode this client does not know
- **THEN** this client runs Pomodoro and keeps the stored value unchanged

#### Scenario: Unknown sound length
- **WHEN** a newer client stores a sound length this client does not know, with the sound on
- **THEN** this client plays the short tone and keeps the stored value unchanged

#### Scenario: Older client
- **WHEN** the user chose Long and a session ends on a client that knows only the on/off sound
- **THEN** that client plays the short tone

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

### Requirement: Visible ways into Focus
Besides `g` then `Shift+F` and the command palette, Focus SHALL be reachable from the sidebar's More group (see `app-shell` "Focus in the More group"), from a Focus button in the task panel's header beside its ⋯ menu, and from "Start focus" in the task Actions menu (see `action-menus` "Start focus from a task's menu"). The panel button, "Start focus" and the panel menu's "Focus on this task" SHALL do the same thing for an open task the user can edit:
- They open `/focus/<task id>` and start a work session in the current mode.
- In Countdown they first ask for the length.
- When the device's session already runs on that task, they only open the screen.
- When it runs on another task, they leave that session as "Change task" does (its time entry stops) and show a toast naming the task left, with Undo that returns to it and resumes it.

They SHALL NOT be offered for a completed or trashed task or to a viewer. They write nothing beyond the session's time entry, so they work offline.

#### Scenario: Start from the panel header
- **WHEN** the mode is Pomodoro, no session runs, and the user opens "Write the report" in the panel and presses its Focus button
- **THEN** `/focus/<its id>` opens with a 25 minute work session already running

#### Scenario: Countdown asks first
- **WHEN** the mode is Countdown and the user chooses "Start focus" on a row
- **THEN** the Focus screen opens on that task with the length dialog, and the timer starts only after a length or a preset is chosen

#### Scenario: Switching from another task
- **WHEN** a session runs on "Email Anna" and the user chooses "Start focus" on "Write the report"
- **THEN** the "Email Anna" time entry stops, a session starts on "Write the report", and a toast reads "Left Email Anna" with Undo, which brings "Email Anna" back with a new running entry

#### Scenario: Already running here
- **WHEN** a session runs on "Write the report" and the user presses the panel's Focus button on the same task
- **THEN** the Focus screen opens with the same session and the timer unchanged

#### Scenario: Viewer and completed tasks
- **WHEN** the user opens a completed task, or a task in a project where they are a viewer
- **THEN** the panel header shows no Focus button and the menus offer neither "Start focus" nor "Focus on this task"

#### Scenario: Offline
- **WHEN** the device is offline and the user starts focus from a row
- **THEN** the session starts and its time entry is written to the outbox and syncs when the network returns

### Requirement: Extend a finished session
When a work session of Pomodoro or Countdown ends, its done state SHALL also offer "+5 min" and "+15 min" for up to 10 minutes after the end, until a break or the next session starts. Choosing one SHALL continue the same session on the same task for that many minutes:
- It is the same Pomodoro cycle; the cycle count does not advance a second time.
- It starts a new time entry, as resuming does, so the time the done state was shown is not logged.
- It cancels a pending automatic break.
- It is announced like a started session.

Flowtime sessions and breaks SHALL NOT offer it.

#### Scenario: Five more minutes
- **WHEN** the second Pomodoro work session of 25 minutes ends and the user picks "+5 min" a minute later
- **THEN** the timer counts down 5:00 on the same task, the task gains a second time entry that starts now, and when it ends the break offered is still the short break

#### Scenario: Gone after the break
- **WHEN** a work session ended and the user started the break
- **THEN** the break shows no "+5 min" or "+15 min", and neither does the done state of the break

#### Scenario: Gone after ten minutes
- **WHEN** a Countdown session ended eleven minutes ago and the user returns to the Focus screen
- **THEN** the done state offers its usual actions without the extensions

#### Scenario: Automatic break cancelled
- **WHEN** "Start breaks automatically" is on and the user picks "+15 min" while the done state is shown
- **THEN** no break starts, and the work timer runs for 15 minutes

### Requirement: Countdown presets
The Countdown length dialog SHALL show the user's presets as chips above the length field, in the user's order. Choosing a chip SHALL start the session with that length at once. The field SHALL still accept any length from 5 to 180 minutes.

The presets SHALL be a personal preference: up to four whole minutes, each from 5 to 180, edited in Settings → General → Focus with a Reset action. The default is 10, 20 and 40. Duplicates are dropped and values outside the bounds are refused before they are stored. A stored list that cannot be read reads as the default, and entries that are not numbers or are out of range are ignored on read.

#### Scenario: One-tap preset
- **WHEN** the mode is Countdown and the user presses Space on the Focus screen, then chooses the "40" chip
- **THEN** a 40 minute countdown starts and the dialog closes

#### Scenario: Edit the presets
- **WHEN** the user sets the presets to 15, 45 and 90 in Settings → General → Focus on the laptop
- **THEN** the phone's Countdown dialog shows 15, 45 and 90 after sync

#### Scenario: Out of range
- **WHEN** the user types 200 into a preset field
- **THEN** the field refuses it with the allowed range (5 to 180 minutes) and the stored presets are unchanged

#### Scenario: Unreadable stored value
- **WHEN** a newer client stored a preset list holding `"abc,25"`
- **THEN** this client shows the chip 25 only, and keeps the stored value unchanged until the user edits it

### Requirement: Background noise
The user SHALL be able to choose background noise for work sessions: Off (the default), White, Pink or Brown. The sound SHALL be generated on the device and never loaded from a file or the network.

While the choice is not Off, the noise SHALL play only while a work phase runs, on any screen of the app, and SHALL fade out when the session is paused, ends, goes into a break, or is left, and on sign-out. When the browser refuses to play audio before an interaction (after a reload), the noise SHALL start at the user's next tap or key press in the app, without a prompt.

The choice SHALL be a synced personal preference, edited in Settings → General → Focus and toggled from the Focus screen's overflow menu ("Noise on" or "Noise off"). An unknown value reads as Off and is kept unchanged. The volume (0 to 100, default 40) SHALL be a setting of the device that is never synced, shown under the choice with a Preview button.

#### Scenario: Off by default
- **WHEN** a user who never changed the setting runs a session
- **THEN** no noise plays and Settings → General → Focus shows Noise: Off

#### Scenario: Plays only while working
- **WHEN** the noise is Brown and the user starts a Pomodoro session, leaves the Focus screen for the Inbox, then pauses with Space on the Focus screen
- **THEN** the noise plays from the start, keeps playing in the Inbox, and fades out on the pause

#### Scenario: Breaks are quiet
- **WHEN** a work session ends and the break starts
- **THEN** the noise fades out and stays off until the next work session starts

#### Scenario: After a reload
- **WHEN** the page is reloaded during a work session with Pink noise on
- **THEN** the timer continues, and the noise starts at the user's next tap or key press

#### Scenario: Volume stays on the device
- **WHEN** the user lowers the volume to 10 on the laptop
- **THEN** the laptop plays the noise more quietly, and the phone keeps its own volume and the same noise choice

#### Scenario: Older client
- **WHEN** a client that predates this change receives `focus_noise` set to `brown`
- **THEN** it plays nothing and keeps the stored value unchanged

### Requirement: New focus preferences sync
The Countdown presets and the noise choice SHALL be stored as additive fields on the user's synced preferences row, like the other focus preferences. They carry no content, sync to the user's devices only, are written offline through the outbox, converge per field by last-writer-wins, and are included in the export. The noise volume SHALL be stored only on the device and cleared on sign-out.

#### Scenario: Concurrent edits
- **WHEN** the laptop sets the noise to White and the phone sets the presets to 15 and 30, both offline, then both sync
- **THEN** every device shows White noise and the presets 15 and 30

#### Scenario: In the export
- **WHEN** the user exports their data
- **THEN** the preferences carry `focus_presets` and `focus_noise`, and nothing about the device's noise volume

### Requirement: Session details on the time entry
When the Focus screen starts or resumes a work stretch and time tracking is present, the time entry it writes SHALL carry, in the same batch, `focus_mode` (`pomodoro`, `flowtime` or `countdown`), `focus_session` (the work session's number in the Pomodoro cycle, `0` otherwise) and `planned_end_at` (the moment the stretch ends if nothing changes, null for Flowtime). A resume after a pause SHALL start a new entry whose `planned_end_at` is the resume time plus the time that was left. A change to the running stretch's length SHALL write `planned_end_at` again. The fields SHALL be written offline through the outbox like the entry's other fields. Breaks SHALL write nothing, and entries started outside the Focus screen SHALL keep the defaults (`""`, `0`, null).

#### Scenario: Third Pomodoro
- **WHEN** the mode is Pomodoro with 25 minute work sessions and the user starts the third work session at 10:00
- **THEN** the running entry carries `focus_mode: "pomodoro"`, `focus_session: 3` and `planned_end_at` 10:25, and another device shows the same after sync

#### Scenario: Resume after a pause
- **WHEN** the user pauses that session at 10:10 and resumes at 10:20
- **THEN** the first entry ends at 10:10, and the new running entry carries session 3 and `planned_end_at` 10:35

#### Scenario: Flowtime
- **WHEN** the user starts a Flowtime session
- **THEN** the running entry carries `focus_mode: "flowtime"`, `focus_session: 0` and no planned end

#### Scenario: Offline session
- **WHEN** the device is offline and the user runs a Countdown session of 40 minutes
- **THEN** the entry and its three fields are stored locally at once and upload together on the next successful sync

#### Scenario: Without time tracking
- **WHEN** time cannot be logged on the device
- **THEN** no entry and therefore none of the three fields is written, as "Sessions are time entries" says for the degraded case

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

### Requirement: Session syncs across the user's devices
A person SHALL have one Focus session across their devices. Its shared state (the task, the mode, the phase, when the phase started, whether its clock runs and since when, the time accumulated before a pause, the planned length, the Pomodoro cycle position, the break kind, the stretch's time entry and how the last run ended) SHALL be stored as one additive field, `focus_run`, on the user's synced preferences row: it carries ids and times only, no content, reaches only the person's own devices, and is not encrypted. Starting, pausing, resuming, ending, taking or ending a break, extending, completing the task on the device, and choosing or leaving a task SHALL write it, offline included: the device shows the change at once and the op waits in the outbox. Every device SHALL compute the clock from the stored times on the server's clock (its own clock corrected by the offset sync observes), and SHALL never write while a session merely runs; the end of a timed run, a pause because the entry was stopped elsewhere, the end because the task was completed or trashed elsewhere, and "Not now" on the break reminder SHALL be derived on each device and not written. Concurrent changes SHALL converge by last-writer-wins on the whole field, so every device ends with the later change and never a mix of two sessions. The last Countdown length and the break reminder's "Not now" stay on the device. A client that cannot read the stored value SHALL ignore it and keep it. The device that made the last written change owns the session: only it SHALL play the end sound, show the session end notification, play background noise, show the break reminder and hand the session to a native shell's lock-screen timer; other devices SHALL show the same state silently. The export SHALL carry `focus_run` with the other preferences, neither an import nor a server backup restore SHALL bring it back, and sign-out SHALL clear only the device's copy.

#### Scenario: Started on the laptop, seen on the phone
- **WHEN** the user starts a 25 minute Pomodoro on "Write the report" on the laptop at 10:00 and opens the Focus screen on the phone at 10:10, after sync
- **THEN** the phone shows "Write the report" with 15:00 left and counting, and nothing is written while it counts

#### Scenario: Paused on the phone
- **WHEN** the user pauses that session on the phone at 10:12 and the laptop syncs
- **THEN** the laptop shows the session paused with 13:00 left, and resuming on either device continues from 13:00

#### Scenario: Ended on time
- **WHEN** the session started on the laptop reaches its end while both devices are open
- **THEN** both show the done state; only the laptop plays the sound or shows the notification, and neither writes the end to `focus_run`

#### Scenario: The phone takes over
- **WHEN** the user pauses and resumes the laptop's session on the phone and it then ends
- **THEN** the phone plays the sound or shows the notification, and the laptop shows the done state silently

#### Scenario: Two devices start offline
- **WHEN** the laptop starts a session on "Write the report" and, later, the phone starts one on "Email Anna", both offline, and both then sync
- **THEN** every device shows the session on "Email Anna", the later change, and no device shows a mix of the two

#### Scenario: Offline
- **WHEN** the phone is offline and the user starts a session there
- **THEN** the timer runs at once and the session reaches the other devices on the phone's next successful sync

#### Scenario: Sleeping laptop
- **WHEN** the laptop sleeps during a session, the user starts another session on the phone, and the laptop wakes after the first session's planned end
- **THEN** the laptop shows the first session as ended until it syncs, then the phone's session, and the phone's session is not replaced, also when the next session would start on its own

#### Scenario: Closed tab
- **WHEN** the user closes the tab during a session and opens the app again an hour later
- **THEN** the Focus screen shows the session as ended (a timed session) or as still counting (Flowtime), as the clock says, and offers the done state

#### Scenario: Restore
- **WHEN** the user imports an export made during a session, or the owner restores a server backup taken during one
- **THEN** the preferences come back without that session, and the devices keep the session they run now

#### Scenario: Clock off on the phone
- **WHEN** the phone's clock runs three minutes slow and the laptop's session shows 15:00 left
- **THEN** the phone shows 15:00 left too, and a pause there counts the minutes the server counts

#### Scenario: Paused before the entry arrived
- **WHEN** the phone pauses the laptop's session before the laptop's time entry has reached the phone
- **THEN** the laptop ends its entry at the pause when it receives the paused session

#### Scenario: Older client
- **WHEN** a client that does not know `focus_run` runs a session
- **THEN** it keeps its session on the device as before, and other devices keep the last written value
