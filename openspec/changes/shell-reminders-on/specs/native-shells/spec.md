# Spec Delta

## ADDED Requirements

### Requirement: The notification permission is asked with the first reminder
A shell with the `reminders` capability SHALL ask for the phone's notification permission only while the app is visible and only when it is handed a schedule with at least one reminder, and SHALL NOT ask at launch, from a background run, or again after the user answered. A background run that is handed reminders without the permission SHALL keep the schedule, answer that notifications are not allowed yet, and leave the question to the visible app. The web app SHALL treat an answer from a background run as no answer: it SHALL NOT turn the device's setting off because of it. Nothing here changes task data or needs the network.

#### Scenario: First reminder on a fresh install
- **WHEN** the user installs the app, signs in, and adds a task with a reminder for tomorrow
- **THEN** the phone asks to allow notifications at that moment, and after Allow the reminder fires tomorrow with the app closed

#### Scenario: No reminders yet
- **WHEN** the user signs in to an account without any reminder in the next seven days
- **THEN** the phone asks nothing

#### Scenario: A background run comes first
- **WHEN** a reminder arrives from another device during a background run, before the user was ever asked
- **THEN** nothing is asked and the setting stays on, and the phone asks the next time the app is opened

#### Scenario: The user says no
- **WHEN** the user answers the phone's question with Don't allow
- **THEN** the device's setting reads Off with the explanation, reminders still appear inside the app, and the phone is not asked again until the user turns the setting on

### Requirement: Exact alarms are asked for with an explanation
On Android, a shell SHALL NOT open the system's alarm settings by itself. When exact alarms are not allowed it SHALL schedule inexact alarms and answer `exact-denied`, and a shell MAY offer the bridge capability `alarm-settings`, whose method opens the system page where the user allows them, only from the visible app. The web app SHALL then say once per device, where the user is, that reminders can arrive a few minutes late, with an action that opens that page when the capability is listed, and SHALL keep the same notice and action in Settings → Notifications while exact alarms are not allowed. After the user allows them the shell SHALL schedule the stored reminders exactly without waiting for the next hand-over.

#### Scenario: New install on Android 14
- **WHEN** the first reminder is handed over on a phone that refuses exact alarms
- **THEN** the app stays where it is, shows the notice once with Allow, and the reminder is scheduled inexactly

#### Scenario: Allow
- **WHEN** the user taps Allow, turns on Alarms & reminders for OpenTodo and returns
- **THEN** the stored reminders are exact, and the notice is gone from Settings

#### Scenario: A shell without the capability
- **WHEN** the web app runs in an older shell that answers `exact-denied` and does not list `alarm-settings`
- **THEN** the notice says where the setting is in Android's settings and offers no button

### Requirement: A background run ends when the app is done
A shell that runs the web app in the background MAY offer the bridge capability `background` to that run. The web app, in a run that lists it, SHALL tell the shell it is done once it has synced, or found it cannot (offline, signed out, a locked encrypted account), and has handed over the reminders and the widget data that follow from it. The shell SHALL end the run then, and SHALL end it by itself after a limit of at least 60 seconds on Android and within the time iOS grants when nothing is heard. A run that performs a notification action SHALL be done only after the action's operation is stored on the device. A run SHALL change nothing but through the web app's own operations, so an interrupted run loses nothing: what it did not send goes out with the next sync.

#### Scenario: A quick refresh
- **WHEN** a background run syncs and hands over the schedule in four seconds
- **THEN** the run ends then, not after its limit

#### Scenario: A slow server
- **WHEN** the sync of a background run takes 40 seconds on Android
- **THEN** the run lasts until the schedule is handed over, and a reminder set on another device is scheduled

#### Scenario: Offline
- **WHEN** a background run starts without a connection
- **THEN** the web app hands over what the device already knows, says it is done, and the run ends

#### Scenario: An older web app
- **WHEN** the server's web app does not know the capability
- **THEN** the run ends at its limit, as before
