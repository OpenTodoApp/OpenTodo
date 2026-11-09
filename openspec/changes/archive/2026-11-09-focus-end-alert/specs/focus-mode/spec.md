## MODIFIED Requirements

### Requirement: Done state and tone
When a work session or a break ends the screen SHALL show a done state naming what ended, the time worked, and the next step (start the break, start the next session, complete the task, next task). When the user has chosen a sound it SHALL play a tone generated on the device, never an audio file, once per session end, and only while the tab is visible: Short plays the short tone once; Long plays a louder tone about once a second until the user clicks, taps or presses a key in the app, the tab is hidden, or 10 seconds pass. While Long plays on a device that can vibrate and haptics are on, each repeat also vibrates.

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
- **THEN** the done state reads that the session is done with 25:00 worked and offers "Start the break", "Complete the task" and "Next task"

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
