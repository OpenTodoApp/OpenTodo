## ADDED Requirements

### Requirement: Foreground completion sound in mobile shells

A foreground Android or iOS shell that advertises task completion sound SHALL accept a fixed, content-free playback request from the configured server's main frame. It SHALL use system audio policy and remain quiet in iOS Silent mode and Android Silent or Vibrate mode. It SHALL neither change system volume nor interrupt ongoing media to play the cue. A background shell SHALL ignore the request. A client on an older mobile shell lacking the capability SHALL skip the cue.

#### Scenario: Silent phone
- **WHEN** completion sound is enabled and the user completes a task in the shell with silent mode enabled, or with vibrate mode on Android
- **THEN** the task completes and no cue is audible

#### Scenario: Older shell
- **WHEN** the web app runs in a mobile shell without the completion sound capability
- **THEN** task completion works and the web app neither calls the missing capability nor falls back to media playback inside that shell
