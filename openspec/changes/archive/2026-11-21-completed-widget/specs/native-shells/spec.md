# Spec Delta

## ADDED Requirements

### Requirement: Completed widget
The Android app SHALL offer a **Completed** home-screen widget beside the Today widget, showing the number of tasks the person completed today and a bar per day for the last 7 days, scaled to the busiest of them, with a one-letter weekday under each bar and the time of the last update; a tap SHALL open Statistics. It SHALL read only data the web app published through the bridge with the Today list: today's count and the 7-day series (days and numbers only, never task content), counted by the same rules as Statistics from the same local rows, and stored in the app's private storage. The widget SHALL never make a request of its own. While an encrypted account is locked, the web app SHALL publish today's count alone, and the widget SHALL show that count and say it is locked, without bars. A publication from a web app that publishes no completions SHALL leave the widget asking the person to open the app. The bars SHALL use the theme's accent and track colours as the launcher resolves them for light and dark. The iOS app's Completed widget is a separate follow-up. Completing a task from the widget is out of scope.

#### Scenario: A day's completions appear
- **WHEN** the person completes three tasks today and the web app publishes
- **THEN** the Completed widget shows today's count as three, today's bar is the highest of a week in which no day had more, and the update time is shown

#### Scenario: Recent days as bars
- **WHEN** the widget is shown after a publication
- **THEN** it draws seven bars, oldest on the left, each labelled with its weekday's letter, without making any request, and reads them aloud as each weekday and its count

#### Scenario: The same count as Statistics
- **WHEN** a task completed today is in a project shared with the person and was completed by someone else
- **THEN** the widget counts it exactly as Statistics' Completed does for today

#### Scenario: Locked encrypted account
- **WHEN** the account is encrypted and the device is locked
- **THEN** the web app publishes today's count only, and the widget shows that number and "Locked: today's count only", without bars

#### Scenario: An older web app
- **WHEN** the stored publication has no completions
- **THEN** the widget asks the person to open OpenTodo once
