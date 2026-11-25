# Spec Delta

## ADDED Requirements

### Requirement: Upcoming and calendar widgets
The Android shell SHALL offer an **Upcoming** widget and a **Calendar** widget beside the Today widget, both resizable, both using the theme's colours in light and dark at every size the launcher allows. Both SHALL read only data the web app published through the bridge with the Today list (while the app runs or during the hourly refresh), stored in the app's private storage, and SHALL never make a request of their own. The web app SHALL publish for every widget the tasks its own lists show: no kept subtasks and no tasks of archived or trashed projects.

The Upcoming widget SHALL list the open tasks the app's Upcoming lists after today, up to the 50 the web app publishes, in a list that scrolls, under a heading per day ("Tomorrow", then the weekday and date), each with its title and, when set, its time and project; a header with the count, a button that opens quick add, and the time of the last update. A tap on a task SHALL open it in the app, and a tap on the header SHALL open Upcoming. When the publication says the web app can complete tasks, each row SHALL have a completion circle that completes the task as the Today widget's does: hidden at once, completed by the web app through its own operations in a background run, stored on the device as an operation and synced with the next sync when offline, converging through the op log like any other completion, and shown again if no publication confirms it within 30 minutes. A repeating task completed this way SHALL appear under its next date as soon as a publication lists it there, and SHALL be advanced once per tick: a tick SHALL complete only the occurrence it was made on, and SHALL leave a task alone that another device or run has moved on since.

The Calendar widget SHALL show one month as six weeks starting on the app's first day of the week, today marked, and a mark under each day that has open tasks due (a multi-day task marks each of its days; a repeating task marks its next date). Upcoming's "Tomorrow", today's mark and the current month SHALL follow the app's day, including a day that starts after midnight. Arrows SHALL move between the current month and the five months after it, and each Calendar widget SHALL keep its own month. A tap on a day SHALL open that day in the app, and a tap on the month's name SHALL open the month; while the current workspace has Calendar switched off, both SHALL open Upcoming instead.

For an encrypted account, while the device is locked, the Upcoming widget SHALL show the count only, without titles or circles, and the Calendar widget SHALL show the month without marks. A publication from a web app that does not publish a widget's data SHALL leave that widget asking the person to open the app.

#### Scenario: Upcoming by day
- **WHEN** the web app publishes three tasks for tomorrow and one for Friday
- **THEN** the Upcoming widget lists three under "Tomorrow" and one under Friday's weekday and date, each with its time and project when set

#### Scenario: Complete from the Upcoming widget
- **WHEN** the user taps the circle of "Book the dentist", due tomorrow, in the Upcoming widget
- **THEN** the row disappears and the count drops at once, and the web app completes the task in a background run, so the laptop shows it completed after the next sync

#### Scenario: Complete offline from the Upcoming widget
- **WHEN** the phone has no network and the user taps a row's circle in the Upcoming widget
- **THEN** the completion is stored on the phone as an operation and reaches the server with the next sync, and the widget does not list the task in the meantime

#### Scenario: A repeating task in Upcoming
- **WHEN** the user ticks "Water the plants", repeating every two days, under Thursday
- **THEN** it leaves Thursday and, once the background run has published, is listed under Saturday

#### Scenario: A repeating task is advanced once
- **WHEN** the user ticks "Water the plants" under Thursday and another device completes the same occurrence before the background run applies the tick
- **THEN** the task is due on Saturday, not on Monday

#### Scenario: Kept subtasks stay out
- **WHEN** the account keeps open subtasks and "Plan trip" is completed while its subtask "Book hotel", due tomorrow, stays open
- **THEN** the Upcoming widget does not list "Book hotel" and the Calendar widget does not count it

#### Scenario: A day in the calendar
- **WHEN** the user taps the 18th, which carries a mark, in the Calendar widget
- **THEN** the app opens on that day

#### Scenario: Calendar switched off in the workspace
- **WHEN** the current workspace has Calendar switched off and the user taps a day in the Calendar widget
- **THEN** the app opens Upcoming

#### Scenario: Another month
- **WHEN** the user taps the next-month arrow twice in one Calendar widget
- **THEN** that widget shows the month after next with its marks, and another Calendar widget on the home screen keeps its own month

#### Scenario: Locked encrypted account
- **WHEN** the device is locked
- **THEN** the Upcoming widget shows the number of upcoming tasks without titles or circles, and the Calendar widget shows the month without marks

#### Scenario: An older server
- **WHEN** the web app's publication carries neither the Upcoming list nor the calendar days
- **THEN** both widgets ask the person to open OpenTodo once
