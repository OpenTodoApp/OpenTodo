# Spec Delta

## ADDED Requirements

### Requirement: Completed widget
Each shell SHALL offer a **Completed** home-screen widget beside the Today widget, showing the number of tasks the person completed today and a small bar chart of the last several days (at least 7). It SHALL read only data the web app published through the bridge — a short per-day series of completed counts (dates and numbers only, never task content), computed from the same local rows and by the same definition of "completed" as the Stats screen — stored in the app's private storage, and SHALL show the time of the last update. The widget SHALL never make a request of its own. For an encrypted account it SHALL show the chart only from a publication made while the device was unlocked, and SHALL show a count or nothing once the device is locked, as the Today widget does. Completing a task from the widget is out of scope.

#### Scenario: A day's completions appear
- **WHEN** the person completes three tasks today and the widget refreshes
- **THEN** the Completed widget shows today's count as three and today's bar risen accordingly, with the update time

#### Scenario: Recent days as bars
- **WHEN** the widget is shown
- **THEN** it draws one bar per recent day from the published series, so the person sees what they got done over the last week, without the widget making any request

#### Scenario: Locked encrypted account
- **WHEN** the account is encrypted and the device is locked
- **THEN** the widget shows a count or nothing, never titles, and fills the chart again only after a publication made while unlocked
