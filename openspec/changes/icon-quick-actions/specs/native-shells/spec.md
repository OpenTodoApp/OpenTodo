# Spec Delta

## ADDED Requirements

### Requirement: Quick actions on the app icon
The Android and iOS apps SHALL offer three quick actions when the app icon is long-pressed, in this order: "Add task", which opens quick add (the web app's `/?add=`), "Today", which opens the Today list (`/today`), and "Change server", which asks for confirmation and then does what "Change server" does for the first-run server screen. The labels SHALL be translated into every language the shell ships. A quick action SHALL open the app through the same deep link the widgets use, so it reaches only the configured server's web app. A quick action chosen while the app runs SHALL be handed to the running app, which keeps its state (an open sheet, a sign-in in progress) instead of being started again. At a cold start the action SHALL open its screen as the first page (the iOS app's offline start from its cached copy MAY open the start page instead, which is the page that copy holds); before a server is set, Add task and Today SHALL wait for the first-run screen and open once the server is connected, and Change server SHALL do nothing more than show that screen. The actions read and write no task data: adding works offline through the web app's own quick add, and nothing about them syncs.

#### Scenario: Add a task from the icon
- **WHEN** a signed-in user long-presses the app icon and chooses "Add task"
- **THEN** the app opens with quick add focused, also when the app was not running, and a task added offline appears in the list at once and syncs later

#### Scenario: A running app keeps its state
- **WHEN** the user has a task's sheet open, goes to the home screen and chooses "Today" in the icon menu
- **THEN** the same app comes forward and opens the Today list, without loading again from the start

#### Scenario: Today from the icon
- **WHEN** the user chooses "Today" in the icon menu
- **THEN** the app opens on the Today list, whatever start view is set in Settings

#### Scenario: Change server stays last and asks first
- **WHEN** the user chooses "Change server", the last item of the icon menu, including to start the app
- **THEN** the app asks for confirmation once, and nothing is removed until the user confirms

#### Scenario: Change server without a server
- **WHEN** the user chooses "Change server" before any server is set
- **THEN** the first-run screen shows, no confirmation is asked, and connecting a server does not ask to change it

#### Scenario: Translated labels
- **WHEN** the phone's language is German
- **THEN** the icon menu reads "Aufgabe hinzufügen", "Heute" and "Server wechseln"

#### Scenario: Before the first start
- **WHEN** the user chooses "Add task" before any server is set
- **THEN** the first-run screen opens, and quick add opens once the server is connected
