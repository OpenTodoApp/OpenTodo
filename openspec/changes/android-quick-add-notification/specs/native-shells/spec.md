## ADDED Requirements

### Requirement: Quick add from a persistent notification on Android
The Android shell SHALL offer an optional ongoing notification for capturing tasks. It SHALL be off by default and set per phone in Settings → Capture → Quick add. The web app SHALL show the switch only in a shell that lists `quick-add-notification`.

Turning the switch on SHALL show a silent notification of minimum importance on its own channel:
- A tap on the notification SHALL open the app's quick add, as the quick-add widget does.
- Its Add task button SHALL take a title in the notification.
- The web app SHALL save the title in a background run of the app, through its own task operation, read with quick-add syntax. The task SHALL go to the Inbox unless a project is typed.
- The user SHALL stay in the app they were in.
- Offline, the task SHALL be stored on the phone as an operation and synced with the next sync, converging like any other new task.
- For an end-to-end encrypted account, the button SHALL open quick add instead of taking a title.

The notification SHALL come back after a reboot and after an app update. It SHALL go when the switch is turned off, on sign-out and on Change server.

On Android 13 and later, turning the switch on without the notification permission SHALL ask for it. A refusal SHALL leave the switch off, with a notice.

The visible app SHALL never save a task from an address alone.

#### Scenario: Add a task from another app
- **WHEN** the notification is on and, while reading mail, the user pulls down the shade, taps Add task and sends "Call the plumber tomorrow 9am #Home"
- **THEN** the mail app stays in front, a task "Call the plumber" due tomorrow at 09:00 is created in the Home project, and it reaches the user's other devices after the next sync

#### Scenario: Add offline
- **WHEN** the phone has no network and the user sends "Buy milk" from the notification
- **THEN** the task exists on the phone in the Inbox and reaches the server with the next sync

#### Scenario: Open quick add
- **WHEN** the user taps the notification itself
- **THEN** the app opens with quick add and its keyboard, and a task exists only after the user confirms

#### Scenario: Encrypted account
- **WHEN** the account uses end-to-end encryption and the user taps Add task
- **THEN** the app opens with quick add instead of a field in the notification

#### Scenario: Permission refused
- **WHEN** on Android 13 the user turns the switch on and refuses notifications
- **THEN** the switch stays off and the card says Android refused notifications for OpenTodo

#### Scenario: After a reboot
- **WHEN** the switch is on and the phone restarts
- **THEN** the notification is back without opening the app

#### Scenario: Sign out
- **WHEN** the user signs out or changes the server
- **THEN** the notification is gone and the switch reads off

#### Scenario: An address from another app
- **WHEN** another app opens the visible OpenTodo app at `/?add=Buy%20milk`
- **THEN** quick add opens with "Buy milk" and nothing is saved until the user confirms
