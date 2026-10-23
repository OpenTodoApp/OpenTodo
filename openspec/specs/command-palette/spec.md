# command-palette Specification

## Purpose
One box that finds any task, project, label, saved view or Settings section from the data on the device and runs any command of the app by name, so everything is reachable from the keyboard without remembering where it lives.

## Requirements

### Requirement: Open and close the palette
The client SHALL open the palette with `Ctrl+K` (`⌘+K` on macOS) from every signed-in screen, including while a text field has focus, except inside the notes editor where the key keeps its formatting meaning; and from a search button in the header. It SHALL be a dialog with the app's overlay behaviour (full-screen sheet below 640 px, Escape closes, focus returns to where it was); from 640 px it SHALL be a card 40 rem wide near the top of the screen, without a title bar, whose accessible name stays "Search and commands". It SHALL open in Search mode with an empty, focused field. Typing `+`, `>` or `?` as the first character of the empty field SHALL switch to Add, Commands or Ask and remove the character, and a second press of the same prefix SHALL return to Search with the character kept. A segmented control offering Search, Add, Commands and, only when the assistant is available to the user, Ask SHALL be shown below 640 px and on touch screens; with a fine pointer a footer SHALL name the prefixes instead. Escape in Commands or Ask, and in Add when Add was reached from Search, SHALL return to Search before closing; Escape in Add when the palette was opened in Add mode SHALL close it. On a screen that has no quick add of its own, `q` SHALL open the palette in Add mode; on a list screen `q` keeps focusing the list's quick add. Opening, switching modes and closing touch no data.

#### Scenario: Open from a list
- **WHEN** the user is in the Today view and presses `Ctrl+K`
- **THEN** the palette opens in Search mode with an empty, focused input and the browser's own `Ctrl+K` action does not run

#### Scenario: Open while typing in quick add
- **WHEN** focus is in the quick-add field and the user presses `⌘+K` on a Mac
- **THEN** the palette opens and the quick-add text is kept

#### Scenario: Notes editor keeps its shortcut
- **WHEN** focus is in a task's notes editor and the user presses `Ctrl+K`
- **THEN** the editor's link command runs and the palette does not open

#### Scenario: Escape and focus
- **WHEN** the palette is open in Search mode and the user presses Escape
- **THEN** it closes without running anything and focus returns to the element that had it before

#### Scenario: Touch
- **WHEN** a user on a phone taps the header's search button
- **THEN** the palette opens as a sheet with its input focused and the segmented control at its top

#### Scenario: Desktop card
- **WHEN** the user presses `Ctrl+K` on a 1440×900 screen with a mouse
- **THEN** the palette is a 40 rem card near the top of the screen with no title bar, the field at its top, and a footer that reads "Type + to add, > for commands" (and "? to ask" when the assistant is available) instead of the segmented control

#### Scenario: Prefix switches the mode
- **WHEN** the field is empty and the user types `>`
- **THEN** the palette is in Commands mode with an empty field, and typing `>` again returns to Search with `>` in the field

#### Scenario: Ask only when available
- **WHEN** the assistant is not available to the user and they type `?` in the empty field
- **THEN** the palette stays in Search mode with `?` in the field and no Ask segment is shown

#### Scenario: q where there is no quick add
- **WHEN** the user is in Settings or the Week view and presses `q` outside a text field
- **THEN** the palette opens in Add mode with its field focused, and in Today `q` focuses the list's quick add as before

#### Scenario: Escape from Add depends on how it was reached
- **WHEN** the palette was opened with `q` in Settings and the user presses Escape with no row highlighted and no suggestion list open
- **THEN** the palette closes; and when the user had switched from Search to Add with `+`, Escape returns to Search instead

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
When the typed text is a valid filter query containing at least one term other than `search:`, the palette SHALL also list the tasks the query matches, evaluated as the New view page evaluates it, and SHALL offer "Open as a new view" with that query. Text that is not a valid query SHALL be treated as a plain search without any error message.

#### Scenario: Label and priority
- **WHEN** the user types `@errand & p1`
- **THEN** open priority-1 tasks carrying "errand" are listed and the first entry is "Open as a new view"

#### Scenario: Incomplete query shows no error
- **WHEN** the user has typed `@errand &`
- **THEN** no syntax error is shown and the entries matching the text "errand" are listed

#### Scenario: Open in Filter view
- **WHEN** the user picks "Open as a new view" for `due <= friday`
- **THEN** the New view page opens at `/views/new` with that query and its results, and the query is added to this device's filter history

### Requirement: Commands by name
The palette SHALL list every command the app offers by name, each with its keyboard shortcut when it has one, and only when it applies in the current context. A command SHALL run the same function as the button, key or menu item it stands for. The commands SHALL include "Go to Focus" (`g` then `Shift+F`) and, for the selected or open task, "Focus on this task" (OpenSpec change `focus-mode`).

#### Scenario: Command families
- **WHEN** the user opens the palette on any screen
- **THEN** the commands available are drawn from: going to each view, Focus, calendar, the Trash, Activity, Help and each Settings section; acting on the selected task, including focusing on it; every action-menu item of the current project, saved view or label; creating a task, project, label or dashboard; saving the current filter as a view; sync now; the keyboard shortcuts; Vim keybindings on or off; and searching Help for the typed text

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

#### Scenario: Focus on the selected task
- **WHEN** the task "Write the report" is selected and the user types `focus`
- **THEN** "Focus on Write the report" is listed and runs the same action as the task panel's menu item, opening `/focus/<its id>`; with no task selected only "Go to Focus" is listed

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
The cheat sheet and the keyboard guide SHALL list `Ctrl`/`⌘`+`K` from the shortcut registry, the palette's footer SHALL name the keys that move and run and the prefixes for Add, Commands and (when available) Ask, the sidebar footer and the phone tab bar SHALL offer Search, and the user guide SHALL have a page on search and commands reachable from the palette's Help action in its footer.

#### Scenario: Listed in the shortcut help
- **WHEN** the user presses `?`
- **THEN** the "Everywhere" group lists `Ctrl/⌘+K` with "Search and commands"

#### Scenario: Search tab on a phone
- **WHEN** the user taps Search in the phone tab bar
- **THEN** the palette opens as a full-screen sheet with its field focused

#### Scenario: Footer teaches the keys
- **WHEN** the user opens the palette on a desktop with a mouse
- **THEN** the footer shows `↑` `↓` "Choose", `↵` "Run" and the prefixes, and its Help link opens the guide page on search and commands

### Requirement: Palette sections and recents
The palette SHALL group its results under headings in sentence case (Recent, Tasks, Projects, Labels, Views, Commands, Settings), SHALL show the shortcut of a command at the right of its row as keycaps from the shortcut registry, a sequence as its steps joined by a translated "then" ("G then U") and a chord as one keycap, and SHALL list the entries picked most recently on this device under Recent when the box is empty. The highlighted row SHALL use the selected-row surface with its accent bar. When the palette opens with a selected or open task, the field SHALL show that task's title as a small chip at its end. Settings results SHALL include individual settings rows from the settings search index.

#### Scenario: Empty box
- **WHEN** the user opens the palette having recently opened "Website launch" and the Integrations settings
- **THEN** Recent lists those two first, before the context commands

#### Scenario: Shortcut column
- **WHEN** the user types "quick"
- **THEN** "Quick add a task" is listed with a `Q` keycap at its right, not in its secondary text

#### Scenario: Sequence as keycaps
- **WHEN** the user types "upco"
- **THEN** "Go to Upcoming" is listed with the keycaps `G` then `U` at its right

#### Scenario: The selected task is named
- **WHEN** the task "Call the plumber about the boiler" is selected in Today and the user presses `Ctrl+K`
- **THEN** the field shows a chip reading "Call the plumber about the boiler" (cut to one line) and the commands for that task are listed first

### Requirement: Add mode
In Add mode the palette's field SHALL be the quick add, with the defaults of the screen it was opened from (today's date in Today, the project in a project, the Inbox elsewhere), and the inline highlighting of `natural-language-capture`. Under the field it SHALL show one row per field: When, Project, Label, Priority and Estimate always, and Deadline, Repeats, Reminder and Time spent when the line sets them. Each row shows its name and either the value the line sets, with a "Keep as text" control that dismisses that token, or a hint saying how to set it; at its right it shows the token that sets the field (`#`, `@`, `p`, `+`). A footer SHALL show the title as it will be saved ("Understood as you type" before any attribute is recognised) and the keys Enter (Add), Shift+Enter (Add and open) and Escape. `↓` and `↑` in the field SHALL move a highlight over the rows while no suggestion list is open; Tab on a highlighted row, or a click on a row, SHALL edit it: a set row's words are selected in the field, and an unset row's token is started at the end of the line (opening the project or label suggestions for `#` and `@`). Enter SHALL create the task through the same local-first path as the list's quick add, show the same "Added to …" toast, and keep the palette open with an empty field; Shift+Enter SHALL create it the same way, close the palette and open the new task in the list it went to. Add mode SHALL work offline exactly like the quick add.

#### Scenario: Add from Settings
- **WHEN** the user presses `q` in Settings, types `Call Sam tomorrow at 4pm @call` and presses Enter
- **THEN** a task "Call Sam" is in the Inbox due tomorrow at 16:00 with the label call, the toast reads "Added to Inbox · Open", and the field is empty and still focused

#### Scenario: Add in a project
- **WHEN** the palette is opened from the project "Home" and switched to Add with `+`, and the user adds `Fix the tap`
- **THEN** the task is created in Home, and the Project row shows "Home" before Enter

#### Scenario: Offline
- **WHEN** the device is offline and the user adds a task from Add mode
- **THEN** the task appears at once in its list and syncs when the connection returns

#### Scenario: Field rows follow the line
- **WHEN** a project "Home renovation" and a label "call" exist and the user types `Call Mia about the tiles tomorrow 5pm #HomeRenovation @call p2`
- **THEN** When reads tomorrow at 17:00, Project "Home renovation", Label "call", Priority "Priority 2", Estimate shows a hint to type `+30m`, and the footer reads "→ Call Mia about the tiles"

#### Scenario: Keep a token as text from its row
- **WHEN** the line is `Review may report` and the user activates "Keep as text" on the When row
- **THEN** the When row shows its hint, the title reads `Review may report`, and the task has no due date

#### Scenario: Edit an unset row from the keyboard
- **WHEN** the line is `Buy primer`, the user presses `↓` twice to highlight Project and presses Tab
- **THEN** the line reads `Buy primer #` with the caret at its end and the project suggestions are open

#### Scenario: Add and open
- **WHEN** the user is in Settings, has typed `Draft the offer #Work` in Add mode and presses Shift+Enter
- **THEN** the task is created in Work, the palette closes, and the Work project opens with the new task selected and open

### Requirement: Add as a task from Search
In Search mode, while the field holds text, the last entry SHALL always be "Add '<text>' as a task", and `Ctrl`/`⌘`+`Enter` SHALL activate it without moving to it. It SHALL never be the first entry, so Enter on a search never creates a task. Activating it SHALL create the task as Add mode does and close the palette.

#### Scenario: Last entry
- **WHEN** the user types `passport` and two tasks match
- **THEN** the two tasks are listed first and "Add 'passport' as a task" is the last entry

#### Scenario: Ctrl+Enter
- **WHEN** the user has typed `Buy stamps` with no match and presses `Ctrl+Enter`
- **THEN** a task "Buy stamps" is created in the Inbox, the palette closes and the toast offers Open

### Requirement: Ask mode
In Ask mode, shown only when the assistant is available to the user, Enter SHALL open the assistant panel and send the field's text as one turn, exactly as the Ask composer does, and close the palette. Nothing SHALL be sent before Enter.

#### Scenario: Ask
- **WHEN** a user with the assistant available types `?what is overdue in Work` and presses Enter
- **THEN** the assistant panel opens with that message sent as a turn, and the palette is closed

#### Scenario: Typing sends nothing
- **WHEN** the user types in Ask mode and closes the palette with Escape
- **THEN** no request is made to the assistant route
