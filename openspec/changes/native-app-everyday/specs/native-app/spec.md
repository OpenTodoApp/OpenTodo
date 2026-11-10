## ADDED Requirements

### Requirement: Tab navigation
The app SHALL use the platform's tab bar with five destinations: Today, Inbox, Upcoming, Browse and Search. The Inbox tab SHALL show its count. Each tab SHALL keep its own navigation stack, and the platform's back gesture SHALL return within it. Lists SHALL use large titles that collapse on scroll, and at most one row of chrome SHALL sit between the title and the first item.

#### Scenario: Back within a tab
- **WHEN** the user opens a task from Inbox, switches to Today and returns to Inbox
- **THEN** the task detail is still open, and an edge swipe returns to the Inbox list

#### Scenario: Inbox count
- **WHEN** a task is captured into the Inbox from another device while the app is open
- **THEN** the Inbox tab's badge increases without user action

### Requirement: Native list gestures
Task lists SHALL support:
- a full swipe right to complete, with a haptic and a grace period with Undo before the row is removed;
- a swipe left to reveal Schedule and Delete (Schedule and Move in the Inbox);
- a long-press context menu with Schedule, Move, Priority, Labels, Duplicate, Copy link and Delete;
- long-press drag to reorder in lists ordered by hand;
- pull to sync;
- an edit mode with multi-select and a toolbar for Complete, Schedule, Move and Delete.

Each swipe action SHALL also be available as an accessibility action on the row. Changes SHALL be written as ops at once and SHALL work offline.

#### Scenario: Swipe to complete offline
- **WHEN** the user swipes a task right in airplane mode
- **THEN** it is completed with a haptic, the row folds away after the grace period, and the op is sent when the network returns

#### Scenario: Undo a completion
- **WHEN** the user taps Undo within the grace period
- **THEN** the task is open again and in its place, and no completion reaches other devices once sync settles

#### Scenario: VoiceOver user completes
- **WHEN** a VoiceOver user selects the row's Complete action from the actions rotor
- **THEN** the task is completed as with the swipe

#### Scenario: Reorder converges
- **WHEN** a task is dragged to the top of a project in the app while another device moves a different task in the same project
- **THEN** both devices show the same order after sync

### Requirement: Fast capture
One add button SHALL open a capture sheet with the text field focused and the keyboard up within 250 ms on the reference simulator. The shared quick-add parser SHALL highlight recognised dates, projects, labels and priority while typing. A toolbar above the keyboard SHALL set them by tap. Return SHALL add the task and keep the sheet open for the next one. A task SHALL take its context from the screen it was added from (Today's date, the open project, the open label) unless the text says otherwise. Capture SHALL work offline.

#### Scenario: Natural language
- **WHEN** the user types "Call Anna tomorrow 9am #Work p1" and presses Return
- **THEN** a task "Call Anna" is added to Work, due tomorrow at 9:00 with the highest priority, and the field is empty and focused

#### Scenario: Context
- **WHEN** the user captures "Buy milk" from the Groceries project
- **THEN** the task is in Groceries

### Requirement: Task detail
Tapping a task SHALL push its detail onto the stack. The title and notes SHALL be editable in place, with changes written as ops without a Save button. Notes SHALL be edited as Markdown text and merged into the note's document, so concurrent web edits converge, and formatting Markdown cannot express SHALL be preserved. When, Deadline, Project, Labels, Priority, Reminders and Repeat SHALL appear as rows only when set, with one row to add the others. Subtasks, attachments and comments SHALL follow.

#### Scenario: Concurrent note edit
- **WHEN** the user adds a line to a note in the app while another paragraph is edited in the web editor, both online
- **THEN** both edits are in the note on both devices after sync

#### Scenario: Table in a note
- **WHEN** a note containing a table is opened in the app
- **THEN** the table is shown read-only with "Edit on the web", and editing the rest of the note leaves the table unchanged

### Requirement: Native pickers
Dates SHALL be chosen in a sheet with quick choices (Today, Tomorrow, This weekend, Next week, No date), a natural-language line using the shared parser, the system calendar and an optional time. Recurrence SHALL offer the shared presets and a custom rule. Projects, labels and people SHALL be chosen from a searchable list in a sheet, with labels multi-selectable and creatable from the search text. Priority SHALL use a native menu.

#### Scenario: Typed date
- **WHEN** the user types "next fri 3pm" in the date sheet
- **THEN** the calendar shows that Friday selected with 15:00, and Done sets it

### Requirement: Browse and Search
Browse SHALL list projects (each opening as a list with its sections), labels, saved views, notes, the Logbook and Settings. Notes SHALL open rendered and be editable as Markdown. Search SHALL find tasks and notes on the device with the shared matching and ranking, offline.

#### Scenario: Offline search
- **WHEN** the user searches "invoice" in airplane mode
- **THEN** matching tasks and notes are listed from local data

#### Scenario: Saved view
- **WHEN** the user opens a saved view from Browse
- **THEN** it lists the tasks the shared filter evaluator selects, the same set as on the web

### Requirement: In-app settings and the web
The app's settings SHALL cover the account, the server, appearance (system, light, dark), notifications for the app and sign-out. "Open on the web" SHALL open the user's server in the system browser for everything else. The app SHALL NOT show the web app inside a web view.

#### Scenario: Configure automations
- **WHEN** the user taps Open on the web in Settings
- **THEN** Safari (or the default browser on Android) opens the server's settings, outside the app

### Requirement: Encrypted account unlock with the passphrase
For an encrypted account the app SHALL ask for the passphrase after sign-in and at each cold start. It SHALL derive the key with the shared encryption code and keep the unwrapped key only in memory. Content SHALL be decrypted for display and encrypted for every write, as on the web.

#### Scenario: Wrong passphrase
- **WHEN** the user enters a wrong passphrase
- **THEN** the app says it is wrong and nothing is decrypted or written

#### Scenario: Encrypted write
- **WHEN** the user adds a task in an unlocked encrypted account
- **THEN** the task's content fields reach the server encrypted and the web app shows the task after unlocking

### Requirement: Accessibility of the app
Every control SHALL have an accessible label and role. Text SHALL follow the system text size up to the largest accessibility size, with rows growing instead of truncating titles. Colour SHALL never be the only signal. Animations SHALL follow Reduce Motion. The platform accessibility audits SHALL pass on every screen in CI.

#### Scenario: Largest text
- **WHEN** the system text size is the largest accessibility size
- **THEN** Today's rows show full titles on several lines and every action stays reachable

### Requirement: Android conventions
On Android the same screens SHALL use bottom navigation, a floating add button and the system back gesture, with Material components where they exist.

#### Scenario: Back gesture
- **WHEN** an Android user uses the back gesture on a task detail
- **THEN** the app returns to the list the task was opened from
