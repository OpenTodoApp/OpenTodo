## MODIFIED Requirements

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

In a browser, outside the native apps, a tab that is hidden when a timed session or break ends SHALL play the sound at the planned end, timed by the audio clock and not by timers the browser throttles, when that tab's audio was started by a gesture in it (the Start of the session) and still runs. In the background, Long repeats until the tab is shown again or 10 seconds pass. A sound played in the background SHALL NOT be played again when the tab is shown; when the tab's audio did not run, the tone SHALL play when the tab is shown again. This is device-local: nothing is written or synced, and it works offline.

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
- **THEN** the tone repeats about once a second and stops when the user shows the tab again, or after 10 seconds

#### Scenario: Paused before the end
- **WHEN** the tab is hidden and the session is paused on another device before its end
- **THEN** no tone plays at the planned end on this device

#### Scenario: Two tabs
- **WHEN** the app is open in two tabs of the same browser, both hidden or one visible, and the session ends
- **THEN** the tone plays once

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
