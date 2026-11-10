## ADDED Requirements

### Requirement: Today widget fed by the app
The app SHALL publish Today's snapshot to the platform's shared container after each committed change that affects Today, after each sync that changes it and after each background refresh, and SHALL ask the system to reload the widget. The snapshot SHALL carry the time it was made, and the widget SHALL show that time when the snapshot is more than an hour old. The snapshot SHALL contain no content of an encrypted account unless the account is unlocked on the device.

#### Scenario: Completed in the app
- **WHEN** the user completes a Today task in the app and goes to the home screen
- **THEN** the widget no longer shows the task

#### Scenario: Changed on another device
- **WHEN** a Today task is added on the web and the app's background refresh runs
- **THEN** the widget shows the new task

#### Scenario: Stale snapshot
- **WHEN** the widget's snapshot is three hours old
- **THEN** the widget shows "Updated" with the snapshot's time

### Requirement: Share into the app
Text, links and images shared to OpenTodo from another app SHALL be saved by the share extension to the shared container and turned into tasks by the app at launch and on foreground, with the shared share-inbox rules. A share made offline SHALL become a task without loss.

#### Scenario: Share a link
- **WHEN** the user shares a web page from Safari to OpenTodo
- **THEN** the next time the app opens, an Inbox task has the page's title and its link

### Requirement: Reminders on the device with actions
The app SHALL schedule upcoming reminders as local notifications, computed by the shared reminder rules, keeping as many as the platform allows (60 on iOS) and topping them up after changes, syncs and background refreshes. Notifications SHALL offer Complete and Snooze. An action SHALL write an op even when the app was not running and SHALL be sent at the next sync. A reminder SHALL fire once per device.

#### Scenario: Complete from the notification
- **WHEN** a reminder fires and the user chooses Complete without opening the app
- **THEN** the task is completed on the device and the web app shows it completed after the next sync

#### Scenario: Reminder changed on the web
- **WHEN** a reminder's time is changed on the web and the app syncs
- **THEN** the old notification is cancelled and the new one is scheduled

### Requirement: Background refresh
The app SHALL register background refresh with the system. Each run SHALL pull, publish the widget snapshot, reschedule reminders and post a local notification for each new in-app notification addressed to the user. The app's documentation SHALL state that notifications from other people arrive at the next refresh or when the app opens, not instantly.

#### Scenario: Mention while closed
- **WHEN** someone mentions the user while the app is closed and background refresh then runs
- **THEN** the user receives a local notification of the mention

### Requirement: Biometric unlock
For an encrypted account, the user SHALL be able to turn on unlock with Face ID, Touch ID or the fingerprint sensor after unlocking with the passphrase. The data key SHALL be stored only wrapped by a key held in the device's secure hardware that requires biometric authentication. When the system invalidates that key, the app SHALL fall back to the passphrase.

#### Scenario: Biometric enrollment changes
- **WHEN** the user adds a new fingerprint in the system settings
- **THEN** the next unlock asks for the passphrase, and biometric unlock can be turned on again

### Requirement: iPad layout
On an iPad at regular width the app SHALL show a split view with the sidebar, the list and the task detail. It SHALL support hardware keyboard shortcuts for new task, search, complete, switching destinations and moving the selection, pointer hover, and dragging a task onto a sidebar project to move it. At compact width it SHALL use the iPhone layout.

#### Scenario: Keyboard capture
- **WHEN** an iPad user with a keyboard presses N in a list
- **THEN** the capture sheet opens with the field focused

#### Scenario: Drag to a project
- **WHEN** the user drags a task onto a project in the sidebar
- **THEN** the task moves to that project

### Requirement: Android distribution without Google services
The Android app SHALL be published on Google Play and F-Droid. No build SHALL depend on Google Play Services or Firebase, and CI SHALL fail when the dependency tree contains them.

#### Scenario: Firebase pulled in
- **WHEN** a dependency update brings `com.google.firebase` into the Android build
- **THEN** the `app-android` check fails naming the dependency

### Requirement: Switch from the web-view shell
The native app SHALL replace the web-view apps under the existing App Store and Google Play records only after the go/no-go gate in `RELEASING.md` is signed off by the owner. On its first launch after the update it SHALL prefill the server address the shell stored and ask the user to sign in once. The shell's last release SHALL send its outbox and tell the user that the next update is the new app.

#### Scenario: Update from the shell
- **WHEN** a user of the web-view app installs the update
- **THEN** the app opens on the server screen with their address filled in, and after sign-in their tasks are there

#### Scenario: Unsent change in the shell
- **WHEN** the shell has an unsent op at the moment its last release starts with a network
- **THEN** the op is sent before the shell shows the notice
