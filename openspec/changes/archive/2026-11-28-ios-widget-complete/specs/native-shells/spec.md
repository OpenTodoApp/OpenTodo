## ADDED Requirements

### Requirement: Completing a task from the iPhone Today widget
On iOS 17 and later, when the web app's publication says it can complete tasks and the account is not locked, each row of the iPhone app's Today widget SHALL have a completion circle, read aloud as "Complete" and the task's title. A tap SHALL hide the task from the widget at once and lower the header's counts by the tasks hidden, and SHALL have the web app complete it through its own operations, in a background run of the app, exactly as completing it in the app does (a repeating task moves to its next occurrence), using the same completion addresses as the Android app. The shell SHALL never write task data itself. Because a widget cannot start the app, the tick SHALL be kept on the device and handed to the web app the next time the app runs: when it is opened, or at its background refresh. Offline, the completion SHALL be stored on the device as an operation and synced with the next sync; it converges with edits on other devices through the op log like any other completion. A task hidden this way SHALL stay hidden while its tick waits for the app, and SHALL reappear if no publication confirms the completion within 30 minutes of the run that applied it. Below iOS 17, with a web app whose publication does not say it can complete tasks, and while the account is locked, the rows SHALL have no circle and the widget SHALL work as before. The widget SHALL never make a request of its own.

#### Scenario: Complete a task from the iPhone widget
- **WHEN** the user taps the circle of "Call the plumber" in the iPhone Today widget
- **THEN** the row disappears and the count drops by one at once, and the next time the app runs the web app completes the task in a background run, so the laptop shows it completed after the next sync

#### Scenario: Complete offline on the iPhone
- **WHEN** the phone has no network, the user taps a task's circle and later opens the app
- **THEN** the completion is stored on the phone as an operation and reaches the server with the next sync, and the widget does not list the task in the meantime

#### Scenario: Complete an occurrence of a repeating task
- **WHEN** the user taps the circle of a task that repeats every week, due today
- **THEN** the task moves to its next occurrence once, even if another device already completed today's occurrence

#### Scenario: A tick the app has not applied yet
- **WHEN** the user taps a task's circle and does not open the app for two hours
- **THEN** the widget keeps the task hidden, and the app completes it when it next runs

#### Scenario: Locked account or an older web app
- **WHEN** the device's encrypted account is locked, or the web app's publication does not say it can complete tasks
- **THEN** the iPhone Today widget lists what it can without completion circles

#### Scenario: iOS 16
- **WHEN** the app runs on iOS 16
- **THEN** the Today widget's rows have no circle and a tap opens the task, as before
