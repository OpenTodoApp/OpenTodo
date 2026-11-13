# Spec Delta

## ADDED Requirements

### Requirement: Saving a file from the app
When the web app saves a file in a shell, the shell SHALL open the phone's save dialog with the file's name and write the file where the user chooses. This SHALL hold for a file the web app makes on the device (a recovery key, recovery codes, an export of tracked time, a theme, a decrypted attachment) and for a file it fetches from the user's server (an export, an attachment, a server archive), and for no other address. A file SHALL be written whole or not at all: when the user cancels, storage runs out or the transfer breaks, nothing partial SHALL remain and the web app SHALL be able to tell the user it was not saved. The shell SHALL keep no copy after the save ends. Saving works offline for files made on the device, changes no task data and syncs nothing. A shell MAY offer the bridge capability `files` for files made on the device; the web app SHALL use it only when listed and SHALL otherwise save as a browser does. Its payload SHALL be part of the shared bridge fixtures.

#### Scenario: Recovery key on Android
- **WHEN** the user taps Download on the recovery key in the Android app
- **THEN** the save dialog opens with `opentodo-recovery-key.txt`, and the chosen folder holds the file with the key after the user confirms

#### Scenario: Export from the server on iPhone
- **WHEN** the user taps Download export (JSON) in the iOS app
- **THEN** the save dialog opens with `opentodo-export.json` and the file the server sent is saved, fetched with the app's own session

#### Scenario: Cancelled
- **WHEN** the user closes the save dialog without choosing a place
- **THEN** no file is written, the shell keeps no copy, and the app stays where it was

#### Scenario: Offline
- **WHEN** the phone is offline and the user downloads the recovery codes
- **THEN** the file is saved, since it is made on the device

#### Scenario: A foreign address
- **WHEN** a page asks to download from a host that is not the user's server
- **THEN** the shell saves nothing and treats the address as any foreign link

#### Scenario: A shell without the capability
- **WHEN** the web app runs in a shell that does not list `files`
- **THEN** it does not call the method and saves the way it does in a browser

### Requirement: Back stays inside the Android app
On Android, Back SHALL first close what the web app has open (a dialog, a sheet, a task), then go back in the app's history, and leave the app only from its first screen. This SHALL hold every time the app is shown, including after Back has left the app and the user returned to it without the app having been closed.

#### Scenario: Back after returning
- **WHEN** the user leaves the app with Back from Today, opens it again from the launcher, opens a task and presses Back
- **THEN** the task closes and the app stays open on Today

#### Scenario: Back on the first screen
- **WHEN** the user presses Back on the screen the app started on, with nothing open
- **THEN** the app goes to the background, as any Android app does

### Requirement: Haptic feedback through the shell
A shell MAY offer the bridge capability `haptics`: the web app names a kind of feedback, `tick` or `success`, and the shell plays the platform's own feedback for it, following the phone's system setting for touch feedback and needing no permission. A shell SHALL ignore a kind it does not know. The web app SHALL give `success` when a task is completed and `tick` when a long press lifts a row, only while the device's haptics preference is on; in a shell that lists the capability it SHALL use the bridge, and elsewhere it SHALL keep the browser's vibration. The Appearance preference SHALL be shown wherever either way is available. The kinds SHALL be part of the shared bridge fixtures.

#### Scenario: Completing a task on iPhone
- **WHEN** the user completes a task in the iOS app with haptics on
- **THEN** the phone gives its success feedback once

#### Scenario: Haptics off
- **WHEN** the user turned haptics off in Appearance on this device
- **THEN** the web app does not call the shell and nothing is felt

#### Scenario: Unknown kind
- **WHEN** a newer web app hands an older shell the kind `warning`
- **THEN** the shell does nothing and reports no error

### Requirement: Done from a reminder notification
A reminder notification SHALL offer Done in both shells, next to Snooze 10 min and Dismiss. Done SHALL complete the reminder's task through the web app's own task operation, so it applies on the device at once, works offline, and reaches every device when the phone next syncs; a repeating task SHALL move to its next occurrence as it does in the app. On an encrypted account that is locked, Done SHALL open the app at its unlock screen and complete nothing until the user unlocks.

#### Scenario: Done on iPhone
- **WHEN** a reminder notification shows on an iPhone and the user taps Done
- **THEN** the task is completed, the notification is gone, and the completion appears on the user's other devices after the next sync

#### Scenario: Done offline
- **WHEN** the phone is offline and the user taps Done
- **THEN** the task is completed on the phone and the operation is sent when the phone is online again, converging with edits made elsewhere

#### Scenario: Locked account
- **WHEN** the encrypted account is locked and the user taps Done
- **THEN** the app opens at the unlock screen and the task stays open

## MODIFIED Requirements

### Requirement: System bars follow the app's theme
A shell MAY offer the bridge capability `system-bars`, which lets the web app hand it the bar colour as `#rrggbb` and whether the icons on it must be light. A shell that offers it SHALL colour the phone's status bar (and on Android the navigation bar) with it and SHALL show light icons when the payload asks for them and dark icons otherwise, whatever the phone's own appearance is (on iOS, where the status bar is drawn over the page, the colour SHALL fill the web view's background and under-page area). Choosing the icons SHALL NOT change the appearance the page sees from the system. A shell SHALL remember the last colour and icon choice and apply them at its next launch before the page is drawn, and SHALL ignore a malformed payload. The web app SHALL hand the colour over whenever the bar colour changes, and SHALL NOT call the method on a shell that does not list the capability. The payload SHALL be part of the shared bridge fixtures.

#### Scenario: Theme change on Android
- **WHEN** the user switches the dark side's theme while the Android app is in dark mode
- **THEN** the status and navigation bars take the new theme's bar colour in the same moment the page changes

#### Scenario: Dark theme under a light system on iPhone
- **WHEN** the iPhone is in light appearance and the user chooses a dark theme in the app
- **THEN** the status bar icons turn light, and a page that follows the system still sees a light system

#### Scenario: Malformed payload
- **WHEN** the shell receives a colour `red` or a payload without `dark`
- **THEN** it keeps its current bars and logs nothing that contains the payload beyond its length

#### Scenario: Fixture changes
- **WHEN** a change renames the `dark` field of the payload
- **THEN** the web fixture test fails until the fixture is regenerated, and then the Android and iOS unit tests fail until the shells read the new field
