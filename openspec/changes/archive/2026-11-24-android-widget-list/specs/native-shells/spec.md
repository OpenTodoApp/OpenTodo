# Spec Delta

## MODIFIED Requirements

### Requirement: Widgets
The Android shell SHALL offer a Today widget and a quick-add widget (one field opening the app's quick add with the typed text). The Today widget SHALL show today's and overdue open tasks as a list that scrolls, up to the 50 the web app publishes: a header with the count, a button that opens quick add, and the time of the last update; a heading "Earlier" above the overdue tasks and "Today" above the rest when both exist; and per task the title and, when set, its time, its due date (overdue tasks only) and its project. A tap on a task SHALL open it in the app. When the web app's publication says it can complete tasks, each row SHALL have a completion circle: a tap SHALL hide the task from the widget at once and have the web app complete it through its own operations, in a background run of the app, exactly as completing it in the app does (a repeating task moves to its next occurrence). The shell SHALL never write task data itself. Offline, the completion SHALL be stored on the device as an operation and synced with the next sync; it converges with edits on other devices through the op log like any other completion. A task hidden this way SHALL reappear if no publication confirms the completion within 30 minutes. The web app SHALL apply a completion address only in a background run, never in the visible app. The widgets SHALL read only data the web app published through the bridge (the Today list while the app runs or during the hourly refresh), stored in the app's private storage, and SHALL use the theme's colours in light and dark at every size the launcher allows. For an encrypted account the widget SHALL show titles only from a publication made while the device was unlocked, and SHALL show counts only, without completion circles, once the device is locked. The widget SHALL never make a request of its own.

#### Scenario: Today widget after a change elsewhere
- **WHEN** a task is completed on the laptop at 09:00 and the phone's app stays closed
- **THEN** the widget no longer lists it after the next hourly refresh, and the header shows when it was updated

#### Scenario: A long Today list
- **WHEN** the web app publishes 20 tasks for today, two of them overdue
- **THEN** the widget lists all 20 in a list that scrolls, the two overdue ones under "Earlier" with their due date, and the rest under "Today"

#### Scenario: Complete a task from the widget
- **WHEN** the user taps the circle of "Call the plumber" in the Today widget
- **THEN** the row disappears and the count drops by one at once, and the web app completes the task in a background run, so the laptop shows it completed after the next sync

#### Scenario: Complete a task offline
- **WHEN** the phone has no network and the user taps a task's circle in the widget
- **THEN** the completion is stored on the phone as an operation and reaches the server with the next sync, and the widget does not list the task in the meantime

#### Scenario: Complete a repeating task
- **WHEN** the user taps the circle of a task that repeats every week
- **THEN** the task moves to its next occurrence, as completing it in the app does

#### Scenario: An older server
- **WHEN** the web app's publication does not say it can complete tasks
- **THEN** the widget lists the tasks without completion circles

#### Scenario: A completion address in the visible app
- **WHEN** another app opens the visible OpenTodo app at an address asking to complete a task
- **THEN** nothing is completed

#### Scenario: Add from the Today widget
- **WHEN** the user taps the add button in the Today widget's header
- **THEN** the app opens with quick add, and a task exists only after the user confirms

#### Scenario: Nothing left
- **WHEN** the web app publishes no task for today
- **THEN** the Today widget says there is nothing left for today

#### Scenario: Quick add from the widget
- **WHEN** the user types "Call the plumber tomorrow 9am" in the quick-add widget
- **THEN** the app opens with quick add showing that text parsed, and the task exists only after the user confirms

#### Scenario: Locked encrypted account
- **WHEN** the device is locked
- **THEN** the Today widget shows "3 tasks today", no title and no completion circle
