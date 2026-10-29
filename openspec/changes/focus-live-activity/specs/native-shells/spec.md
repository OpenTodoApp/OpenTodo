## ADDED Requirements

### Requirement: The running Focus session outside the app
A shell with the `focus` capability SHALL offer `publishFocus(json)`, and SHALL show the last state the web app published while the app is in the background or the phone is locked. The state holds whether a session runs, is paused, is done or none runs; the phase and break kind; the cycle position; the time accumulated before the current stretch; since when the current stretch runs; the planned end of a timed phase; and the task's title only when the device's "include task titles" option is on and the account is not encrypted.

The iOS shell SHALL show a Live Activity on the lock screen and in the Dynamic Island. The Android shell SHALL show an ongoing notification on a "Focus" channel of low importance. Both SHALL show the title (or "Focus session"), the phase ("Work · 2 of 4", "Short break", "Paused") and a clock the system advances by itself: counting down to the planned end for a timed phase, up for Flowtime, and frozen while paused. A tap SHALL open `/focus`. A **Pause** or **Resume** action SHALL open the app at `/focus?action=pause` or `/focus?action=resume`.

When the planned end passes without a new publication, the shell SHALL show the session as done, and on iOS it SHALL do this through the activity's stale date. The shell SHALL replace what it shows with each publication, and SHALL show at most one activity or ongoing notification. It SHALL remove both, and the stored state, on `none`, on sign-out, and when the server is changed. It SHALL honour the system's switch for Live Activities or for the channel. The payload SHALL be part of the shared bridge fixtures.

#### Scenario: Pomodoro on the lock screen
- **WHEN** the user starts a 25-minute Pomodoro work session on "Write the report" in the iOS app, with task titles allowed on the device, and locks the phone
- **THEN** the lock screen shows "Write the report", "Work · 1 of 4" and a clock counting down from 25:00 that keeps running while the app is suspended

#### Scenario: Paused from the lock screen
- **WHEN** the user taps Pause on the Live Activity
- **THEN** the app opens on the Focus screen with the session paused and its time entry stopped, and the activity shows "Paused" with the frozen time

#### Scenario: Flowtime on Android
- **WHEN** a Flowtime session runs in the Android app and the user leaves the app
- **THEN** an ongoing notification shows the title and a clock counting up, without the app running

#### Scenario: Encrypted account
- **WHEN** the account uses end-to-end encryption and a session runs
- **THEN** the activity and the notification read "Focus session" and no title was handed to the shell

#### Scenario: Ended while the app sleeps
- **WHEN** a timed session's planned end passes while the iOS app is suspended
- **THEN** the activity reads "Session done", and it is removed once the web app next publishes or after the system's limit

#### Scenario: Live Activities switched off
- **WHEN** the user turned off Live Activities for OpenTodo in iOS settings and starts a session
- **THEN** no activity appears, the session runs as before, and the session-end notification still arrives

#### Scenario: Killed and reopened
- **WHEN** the app is killed during a session and opened again
- **THEN** the web app publishes the stored state and the existing activity is updated, not duplicated

### Requirement: Session-end notification from the shell
A shell with the `focus` capability SHALL schedule a local notification at the planned end of each timed phase it was handed: "Session done" for work, "Break over" for a break, naming the task only when a title was handed over. It SHALL reschedule it on each publication and cancel it when the session is paused, done or none runs. On Android it SHALL use the exact alarm the reminders use, and fall back to an inexact one when exact alarms are denied. A tap SHALL open `/focus`.

#### Scenario: Session ends in the background
- **WHEN** a 25-minute session runs in the Android app, the user switches to another app, and the 25 minutes pass
- **THEN** a "Session done" notification appears at the end, and tapping it opens the Focus screen with the done state

#### Scenario: Paused before the end
- **WHEN** the user pauses the session five minutes before its planned end
- **THEN** the scheduled notification is cancelled and none arrives

#### Scenario: Exact alarms denied
- **WHEN** the Android user denied exact alarms
- **THEN** the session-end notification is scheduled inexactly and the ongoing notification still shows the clock
