## ADDED Requirements

### Requirement: Captures queued on the device
A shell with the `capture` capability SHALL keep captures made outside the web view (Siri, Shortcuts, a widget or a control) in a queue in its private storage. Each entry holds an id, the text (trimmed, at most 500 characters), the creation time and the source. At most 50 entries SHALL wait at once, and an entry SHALL leave the queue only when the web app acknowledges it, when the server is changed, or when the user signs out. The bridge SHALL offer `readCaptures()` (the waiting entries as JSON) and `ackCaptures(ids)`. While the shell lists `capture`, the web app SHALL read the queue on start, when it becomes visible and after each sync. It SHALL file each entry with its quick-add parser as one task created through the operation log with the entry's id as the task's id, and it SHALL acknowledge an entry once a task with that id exists in the local store. On an end-to-end encrypted account the web app SHALL file entries only while the account is unlocked. When entries are waiting, the sign-out confirmation SHALL say how many will be discarded. The payloads SHALL be part of the shared bridge fixtures.

#### Scenario: Filed offline
- **WHEN** the phone has no network, the user adds "Buy stamps tomorrow" with Siri and later opens the app
- **THEN** the task "Buy stamps" due tomorrow is in the Inbox, it is in the outbox until the network returns, and then it syncs to the other devices

#### Scenario: Interrupted filing
- **WHEN** the web app created the task of an entry and was stopped before acknowledging it
- **THEN** the next run finds the task with the entry's id, creates nothing, and acknowledges the entry, so exactly one task exists

#### Scenario: Locked encrypted account
- **WHEN** the account uses end-to-end encryption, is locked on the phone, and two entries wait
- **THEN** nothing is filed and nothing is sent; after the user unlocks, both tasks are created with encrypted titles

#### Scenario: Queue full
- **WHEN** 50 entries wait and the user asks Siri to add another task
- **THEN** Siri answers that OpenTodo must be opened first, and the 50 waiting entries are kept

#### Scenario: Sign-out with waiting captures
- **WHEN** two entries wait and the user chooses Sign out in the app
- **THEN** the confirmation says two captures from Siri have not been added and will be discarded, and confirming deletes them

#### Scenario: Shell without the capability
- **WHEN** the web app runs in a browser, in the Android app or in an iOS app that does not list `capture`
- **THEN** it never calls `readCaptures` and behaves as before

### Requirement: Siri and Shortcuts actions on iOS
The iOS shell SHALL offer App Intents, each an App Shortcut with phrases that name the app in English, German, French, Spanish, Italian and Portuguese:
- **Add task**, with a text parameter that Siri asks for when it is missing. It queues the text as a capture without opening the app, then tries to file it with a hidden run of the web app for up to 8 seconds. It answers "Added to OpenTodo" when the entry was filed in that time, and otherwise that the task will be added the next time the app runs (or once the account is unlocked, when the last publication was locked).
- **Open quick add**, which opens the app at `/?add=`.
- **Open Today**, which opens the app at `/today`.
- **What's on today**, which answers without opening the app or making a request. It uses the last Today publication: the count, the overdue count and up to five titles with their times, plus the time of the publication, and only counts when the publication was made while the account was locked.

The intents SHALL never make a network request of their own, and they SHALL be usable from the Action Button and inside the user's own Shortcuts.

#### Scenario: Hands-free capture
- **WHEN** the phone is locked and the user says "Add a task in OpenTodo", then "Call the dentist Friday at 10"
- **THEN** Siri confirms without unlocking the phone, and the task "Call the dentist" due Friday at 10:00 appears in OpenTodo on every device once the app has filed it

#### Scenario: Server unreachable
- **WHEN** the portable build cannot reach the server and the user adds a task with Siri
- **THEN** Siri says the task will be added the next time the app runs, and the entry waits in the queue

#### Scenario: Today at a glance
- **WHEN** the last publication was at 09:12 with three tasks for today, one of them overdue, and the user asks "What's on today in OpenTodo"
- **THEN** Siri answers with the three titles and their times, says one is overdue and that the list is from 09:12, and no request is made

#### Scenario: Encrypted and locked
- **WHEN** the last publication was made while the encrypted account was locked
- **THEN** "What's on today" gives the counts and no title

#### Scenario: Action Button
- **WHEN** the user assigns the "Add task" shortcut to the Action Button and presses it
- **THEN** the system asks for the text and the capture is queued as with Siri

## MODIFIED Requirements

### Requirement: Widgets
The Android shell SHALL offer a Today widget (today's and overdue open tasks: title, time and priority, the count in the header, a tap opening the task) and a quick-add widget (one field opening the app's quick add with the typed text). The iOS shell SHALL offer the Today widget, a quick-add widget, lock-screen widgets and, on iOS 18 or later, a control. The platform has no text input in a widget, so the iOS quick-add widget is a button that opens quick add empty (`/?add=`), like the Android widget's button. The lock-screen widgets are today's count with an overdue mark, the next tasks with their times, a one-line summary, and an "Add" button that opens quick add. The control is "Add task", which opens quick add. The widgets SHALL read only data the web app published through the bridge (the Today list while the app runs or during a background refresh), stored in the app's private storage, and SHALL show the time of the last update where there is room. For an encrypted account the widget SHALL show titles only from a publication made while the device was unlocked, and SHALL show counts only once the device is locked. On iOS, titles on the lock screen SHALL be marked as private so the system hides them while the phone is locked unless the user allowed otherwise. The widget SHALL never make a request of its own.

#### Scenario: Today widget after a change elsewhere
- **WHEN** a task is completed on the laptop at 09:00 and the phone's app stays closed
- **THEN** the widget no longer lists it after the next refresh, and the header shows when it was updated

#### Scenario: Quick add from the widget
- **WHEN** the user types "Call the plumber tomorrow 9am" in the Android quick-add widget, or taps the iOS quick-add widget and types the same text
- **THEN** the app opens with quick add showing that text parsed, and the task exists only after the user confirms

#### Scenario: iOS capabilities
- **WHEN** the web app runs in the iOS shell and reads `capabilities`
- **THEN** `widgets` means the Today, quick-add and lock-screen widgets, all fed by the same publication, and the quick-add widget opens quick add empty instead of carrying text

#### Scenario: Locked encrypted account
- **WHEN** the device is locked
- **THEN** the Today widget shows "3 tasks today" and no title

#### Scenario: Lock screen on a locked phone
- **WHEN** the rectangular lock-screen widget shows the next tasks and the phone is locked
- **THEN** the titles are hidden by the system and the times and count stay visible, unless the user allowed lock-screen data for widgets in iOS settings

#### Scenario: Control on an older iOS
- **WHEN** the app runs on iOS 17
- **THEN** no control is offered, and the widgets and intents work as described
