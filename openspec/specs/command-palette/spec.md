# command-palette Specification

## Purpose
One box that finds any task, project, label, saved view or Settings section from the data on the device and runs any command of the app by name, so everything is reachable from the keyboard without remembering where it lives.

## Requirements

### Requirement: Open and close the palette
The client SHALL open the palette with `Ctrl+K` (`⌘+K` on macOS) from every signed-in screen, including while a text field has focus, except inside the notes editor where the key keeps its formatting meaning; and from a search button in the header. It SHALL be a dialog with the app's overlay behaviour (bottom sheet below 640 px, Escape closes, focus returns to where it was). Opening and closing touch no data.

#### Scenario: Open from a list
- **WHEN** the user is in the Today view and presses `Ctrl+K`
- **THEN** the palette opens with an empty, focused input and the browser's own `Ctrl+K` action does not run

#### Scenario: Open while typing in quick add
- **WHEN** focus is in the quick-add field and the user presses `⌘+K` on a Mac
- **THEN** the palette opens and the quick-add text is kept

#### Scenario: Notes editor keeps its shortcut
- **WHEN** focus is in a task's notes editor and the user presses `Ctrl+K`
- **THEN** the editor's link command runs and the palette does not open

#### Scenario: Escape and focus
- **WHEN** the palette is open and the user presses Escape
- **THEN** it closes without running anything and focus returns to the element that had it before

#### Scenario: Touch
- **WHEN** a user on a phone taps the header's search button
- **THEN** the palette opens as a bottom sheet with its input focused

### Requirement: Search over local data
The palette SHALL find tasks by title, notes text, origin id and origin title, projects by name and parent path, labels by name, saved views and dashboards by name, and Settings sections by name and description, from the device's local tables only. Deleted tasks, projects, labels and views SHALL never be listed; completed tasks and archived projects SHALL be listed after open and live ones with a marker. Search SHALL work offline and SHALL send nothing to the server.

#### Scenario: Find a task by a word in its notes
- **WHEN** a task "Renew passport" has notes containing "appointment at 9" and the user types `appoint`
- **THEN** "Renew passport" is listed with its project as context

#### Scenario: Find a task by its issue id
- **WHEN** a task "Fix the login timeout" has origin id `ENG-123` and the user types `eng-123`
- **THEN** "Fix the login timeout" is listed, from local data

#### Scenario: Completed and archived are marked
- **WHEN** the user types `paint` and a completed task and an open task both match
- **THEN** the open task is listed first and the completed one is marked "completed"

#### Scenario: Offline
- **WHEN** the device is offline and the user types a project name
- **THEN** the project is listed from local data with no error and no request

#### Scenario: Encrypted account
- **WHEN** an end-to-end encrypted account is unlocked on the device and the user searches a task title
- **THEN** the task is found from the decrypted local copy, and no title, query or index leaves the device

### Requirement: Matching and ranking
Matching SHALL ignore case and accents and SHALL rank an exact match first, then a match at the start of a word, then letters in order. Ties SHALL be broken by how often and recently the entry was picked on this device, then by kind in the order commands, tasks, projects, labels, views, settings. The list SHALL show at most 50 entries and say how many more match. Pick history SHALL stay on the device, never synced or exported, and SHALL be cleared at sign-out.

#### Scenario: Word prefix beats fuzzy
- **WHEN** the user types `pas` and there are a task "Renew passport" and a project "Pre-sales"
- **THEN** "Renew passport" (a word starts with the text) is listed before "Pre-sales" (letters in order only), although projects rank before tasks on a tie

#### Scenario: Accents
- **WHEN** the user types `cafe`
- **THEN** a label "Café" is listed

#### Scenario: Recently picked first on a tie
- **WHEN** the user opened project "Work" from the palette yesterday and types `wor`, which also matches a task "Work on slides"
- **THEN** "Work" is listed first on this device, and another device of the same account shows its own order

### Requirement: Filter queries inline
When the typed text is a valid filter query containing at least one term other than `search:`, the palette SHALL also list the tasks the query matches, evaluated as the Filter view evaluates it, and SHALL offer "Open in Filter view" with that query. Text that is not a valid query SHALL be treated as a plain search without any error message.

#### Scenario: Label and priority
- **WHEN** the user types `@errand & p1`
- **THEN** open priority-1 tasks carrying "errand" are listed and the first entry is "Open in Filter view"

#### Scenario: Incomplete query shows no error
- **WHEN** the user has typed `@errand &`
- **THEN** no syntax error is shown and the entries matching the text "errand" are listed

#### Scenario: Open in Filter view
- **WHEN** the user picks "Open in Filter view" for `due <= friday`
- **THEN** the Filter view opens with that query and its results, and the query is added to this device's filter history

### Requirement: Commands by name
The palette SHALL list every command the app offers by name, each with its keyboard shortcut when it has one, and only when it applies in the current context. A command SHALL run the same function as the button, key or menu item it stands for.

#### Scenario: Command families
- **WHEN** the user opens the palette on any screen
- **THEN** the commands available are drawn from: going to each view, calendar, the Trash, Activity, Help and each Settings section; acting on the selected task; every action-menu item of the current project, saved view or label; creating a task, project, label or dashboard; saving the current filter as a view; sync now; the keyboard shortcuts; Vim keybindings on or off; and searching Help for the typed text

#### Scenario: Navigate
- **WHEN** the user types `upco` and presses Enter on "Go to Upcoming"
- **THEN** the Upcoming view opens, exactly as `g` then `u` does

#### Scenario: Task command needs a selected task
- **WHEN** no task is selected and the user types `complete`
- **THEN** no "Complete task" command is listed, and when a task is selected the command is listed with the task's title and runs the same completion as `c`

#### Scenario: Menu action by name
- **WHEN** the user is in a saved view and types `pin`
- **THEN** "Pin to sidebar" for that view is listed and runs the same action as the view's menu item

#### Scenario: Context commands on an empty box
- **WHEN** the user opens the palette with a task selected and types nothing
- **THEN** the commands for that task and the current view are listed before recently picked entries

### Requirement: Picking an entry
Enter or a tap on an entry SHALL run it and close the palette: a task opens in its project or Inbox with its detail panel; a project, label, saved view, dashboard or Settings section opens; a command runs. Running a command that writes data SHALL use the same local-first path as the button or key it stands for, so it applies at once, works offline and converges like any edit.

#### Scenario: Open a task
- **WHEN** the user picks the task "Renew passport" of project "Home"
- **THEN** the Home project opens with that task selected and its detail panel open

#### Scenario: Open a completed task
- **WHEN** the user picks a completed task
- **THEN** its project (or the Inbox) opens with the task's detail panel open, even though the task is not in that list

#### Scenario: Write command offline
- **WHEN** the device is offline, a task is selected and the user runs "Set priority 1"
- **THEN** the task's priority is 1 at once, the change is queued, and other devices converge after sync

### Requirement: Registry stays complete
Every action available in the project, saved view, label and section menus SHALL have a command in the palette's registry, and an automated check SHALL fail when a menu action has no command. Every registry command SHALL be reachable by its label in the palette.

#### Scenario: Menu action without a command
- **WHEN** a change adds "Duplicate project" to the project menu and no registry command
- **THEN** the test suite fails naming the missing command

### Requirement: Discoverability and help
The cheat sheet and the keyboard guide SHALL list `Ctrl`/`⌘`+`K` from the shortcut registry, the palette's input SHALL show a hint about commands and filter queries while empty, the sidebar footer and the phone tab bar SHALL offer Search, and the user guide SHALL have a page on search and commands reachable from the palette's Help action.

#### Scenario: Listed in the shortcut help
- **WHEN** the user presses `?`
- **THEN** the "Everywhere" group lists `Ctrl/⌘+K` with "Search and commands"

#### Scenario: Search tab on a phone
- **WHEN** the user taps Search in the phone tab bar
- **THEN** the palette opens as a full-screen sheet with its field focused

### Requirement: Palette sections and recents
The palette SHALL group its results under headings (Recent, Tasks, Projects, Labels, Filters, Commands, Settings), SHALL show the shortcut of a command at the right of its row from the shortcut registry, and SHALL list the entries picked most recently on this device under Recent when the box is empty. Settings results SHALL include individual settings rows from the settings search index.

#### Scenario: Empty box
- **WHEN** the user opens the palette having recently opened "Website launch" and the Integrations settings
- **THEN** Recent lists those two first, before the context commands

#### Scenario: Shortcut column
- **WHEN** the user types "quick"
- **THEN** "Quick add a task" is listed with `q` at its right
