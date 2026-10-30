# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Focus screen layout
The Focus screen SHALL use the page template with its title, the mode as the header's secondary text, at most two visible actions, and an overflow menu holding the mode, "Change task", the noise toggle, Settings and Help. The content column is the only scroll region. The timer and the task fit a 360 px wide screen without horizontal scrolling. It adds no primary sidebar destination by default: Focus is listed in the More group, and becomes a primary destination only when the user promotes it.

#### Scenario: Phone width
- **WHEN** the Focus screen is shown on a 360 px wide screen with a task that has long notes
- **THEN** the timer, its buttons, the title and the notes are shown in one column and only the content column scrolls

#### Scenario: Menu
- **WHEN** the user opens the header's menu
- **THEN** it lists Pomodoro, Flowtime and Countdown with the current one checked, "Change task", "Noise on" (or "Noise off" while noise is chosen), Settings and Help

#### Scenario: Not a primary destination by default
- **WHEN** a user who promoted nothing opens the app
- **THEN** Focus is listed in the More group and not among the primary destinations
