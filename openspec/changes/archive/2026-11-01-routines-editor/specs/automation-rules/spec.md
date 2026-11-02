## MODIFIED Requirements

### Requirement: Rules page
The app SHALL have a Routines page at `/routines` (`/rules` redirecting to it), listed in the sidebar's More group in every "How you work" mode and reachable through the command palette ("Go to Routines", "New routine", "Run routine…"), using the page template (title "Routines", actions New routine and Help, an overflow menu with Pause all routines) and a Runs tab with all runs (`routines` "Routine history and all runs"). It SHALL list the user's routines by position with a switch, a one-line summary of trigger, condition and actions or steps, the last run time and the 7-day run count, a paused reason when set, the number of steps not available, a Run now button, and a menu with Edit, Duplicate, Run now, Test, History, Move up, Move down and Delete (confirmed in a dialog). It SHALL render from local data offline; the run history and the live counts need the server and SHALL say so when offline. The page SHALL work with the keyboard throughout.

#### Scenario: Reading the list
- **WHEN** a user with three rules opens Rules
- **THEN** each row reads like "When a task gets the label waiting · if in Work → Move to Waiting, priority 3 · last ran 2 hours ago · 14 runs this week", with its switch, and `Enter` opens the editor

#### Scenario: Offline
- **WHEN** the page is opened without a connection
- **THEN** the rules are listed and editable, the history and counts show "Needs a connection", and a saved edit syncs later

#### Scenario: A routine's row
- **WHEN** a user's routine "Groceries" has three steps
- **THEN** its row reads "Every Friday at 17:00 → get the note of Groceries, split into lines, create tasks in Errands · last ran Friday · 1 run this week" with Run now and its switch

#### Scenario: Old address
- **WHEN** the user opens `/rules` from a bookmark
- **THEN** the Routines page opens at `/routines`

### Requirement: Rule editor
The editor of a routine SHALL be the sentence-card editor of `routines` "Sentence-card editor"; its When card and its Change tasks card SHALL hold the controls of the former rule dialog: a name; a trigger chooser with the fields its kind needs (a label picker, a project and section picker, a time and weekday picker); condition rows added from a menu, one per predicate, each with the picker its kind needs; the action controls of the board rule editor extended with deadline, assignee, comment, notification and webhook; a live "n open tasks match now" line computed on the device; and Save in the editor's header. Unavailable choices SHALL be disabled with a reason (the comment action for an encrypted account, shared projects in the project action, the webhook action without a webhook). Save SHALL write the rule as operations and work offline.

#### Scenario: Build a rule
- **WHEN** the user chooses "a task gets the label" waiting, adds the condition "in project Work (with sub-projects)", sets the action "section Waiting of Work", and saves
- **THEN** the Rules page lists "When a task gets the label waiting · if in Work → Move to Waiting", on every device after sync

#### Scenario: Encrypted account
- **WHEN** a user of an encrypted account opens the actions menu
- **THEN** "Add a comment" is disabled with "Not available for encrypted accounts", and the other actions work

### Requirement: Rule notifications
The server SHALL deliver in-app notifications: "rule fired" when a rule with the `notify` action applies changes (naming the rule and the task), "rule paused" when the server pauses a rule, and the routine kinds `routine_failed` and `routine_proposal` of `routine-inbox` "Routine notifications in the bell". They SHALL be listed and marked read through the notification routes like other kinds, and SHALL not contact any external service.

#### Scenario: Notification arrives
- **WHEN** a rule with `notify` fires on "Call the plumber"
- **THEN** the user sees an unread notification "Sunday sweep changed Call the plumber" that opens the task
