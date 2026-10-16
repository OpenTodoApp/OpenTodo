# Spec Delta

## MODIFIED Requirements

### Requirement: Task detail panel
Opening a task SHALL show a panel in the shell's panel slot (see `app-shell`) for editing title, notes, project, priority, dates and every other task property, with complete, delete and close actions. The panel SHALL show only the properties that have a value and offer the rest from an Add menu. On narrow screens the panel SHALL open as a full-screen sheet over the list.

#### Scenario: Open from the list
- **WHEN** the user clicks a task's title or presses Enter on a selected task
- **THEN** the detail panel opens with that task's fields and the address carries the task id

#### Scenario: Empty task shows few things
- **WHEN** the user opens a task with a title, a project and nothing else
- **THEN** the panel shows the title, the notes placeholder, the project breadcrumb, the Do on and Priority chips, the subtask line and the Add menu, and no other property

### Requirement: Keyboard navigation
Every primary action SHALL be reachable from the keyboard: `q` quick add, `j`/`k` (or arrows) move, Enter opens, `c` completes or reopens, `1`–`4` set priority, Delete deletes, `g` then `i`/`t`/`u`/`c`/`s` navigates, Escape closes the panel or clears the selection, `?` opens the cheat sheet, and `Ctrl`/`⌘`+`K` opens the search and command palette. Every shortcut SHALL come from the registry in `keyboard-shortcuts`. Shortcuts SHALL not fire while typing in a field, except `Ctrl`/`⌘`+`K` outside the notes editor.

#### Scenario: Navigate with g then t
- **WHEN** focus is not in a text field and the user presses `g` then `t`
- **THEN** the Today view opens

#### Scenario: Typing is not intercepted
- **WHEN** the user types the letter `c` into the quick-add field
- **THEN** no task is completed

#### Scenario: Palette from a field
- **WHEN** focus is in the Filter view's query input and the user presses `Ctrl+K`
- **THEN** the palette opens and the query text is kept

#### Scenario: Cheat sheet lists the context
- **WHEN** the user presses `?` in a project list
- **THEN** the cheat sheet opens with the list shortcuts first, as specified in `keyboard-shortcuts`

### Requirement: Responsive layout and themes
The layout SHALL work from 360 px wide phones to desktops. Below 768 px the sidebar SHALL be a drawer opened from the More tab, and a bottom tab bar SHALL offer Today, Inbox, Upcoming, Search and More, as specified in `app-shell`. It SHALL be light or dark according to the user's appearance mode, which follows the system light or dark preference by default.

#### Scenario: Phone layout
- **WHEN** the viewport is narrower than 768 px
- **THEN** the sidebar is hidden behind the More tab, the task list uses the full width, and the tab bar is visible above the bottom safe area

#### Scenario: Mode overrides the system
- **WHEN** the system prefers light and the user's appearance mode is `dark`
- **THEN** the app renders dark on phones and desktops alike

### Requirement: Task panel layout
The panel SHALL show, top to bottom: a sticky header with the task's checkbox, the editable title, a menu holding Delete, Copy link, Expand and the less frequent actions, and Close; the notes (a single placeholder line until focused, the editor otherwise); the project breadcrumb (project and section); a wrapping row of property chips for the properties that have a value, with Do on and Priority always present; an Add control listing the remaining properties with their shortcuts; the subtasks as a checklist; and the tabbed area with Comments, Activity and History. A chip SHALL read as its value and open its editor on click or Enter; Escape or a committed edit closes the editor with focus back on the chip.

#### Scenario: Values read as values
- **WHEN** the user opens a task due tomorrow at 09:00 with priority 2 in "Work"
- **THEN** the breadcrumb reads "Work", the chips read "Tomorrow 09:00" and "P2", and no input box is visible

#### Scenario: Add a property
- **WHEN** the user opens the Add control and picks Estimate
- **THEN** an Estimate chip appears with its editor open and focused, and leaves again if the editor closes without a value

#### Scenario: Edit a row with the keyboard
- **WHEN** the user tabs to the Do on chip and presses Enter
- **THEN** the When control opens with focus in it, and Escape closes it with focus back on the chip

#### Scenario: Delete from the header menu
- **WHEN** the user opens the header menu and chooses Delete
- **THEN** the task moves to the Trash, the panel closes and a toast offers Undo

#### Scenario: Scrolled panel keeps its context
- **WHEN** the user scrolls the panel down to the comments
- **THEN** the checkbox and title stay visible at the top of the panel

### Requirement: Task panel tabs
The tabbed area SHALL offer Comments (with the comment count), Activity and History as tabs reachable with the keyboard (arrow keys between tabs, Tab into the content). Comments SHALL be the default tab; the last chosen tab SHALL be remembered on the device only. The comment composer SHALL be pinned to the bottom of the panel while Comments is shown, so it is reachable without scrolling. The task's created and completed times SHALL be the first entries of Activity. `Shift+C` SHALL switch to Comments and focus the composer.

#### Scenario: Shortcut to the composer
- **WHEN** the History tab is open and the user presses `Shift+C` outside a text field
- **THEN** the Comments tab is shown and the composer has focus

#### Scenario: Remembered tab
- **WHEN** the user opens the Activity tab, closes the panel and opens another task
- **THEN** the Activity tab is shown for that task on this device

#### Scenario: Composer without scrolling
- **WHEN** a task with thirty comments is opened
- **THEN** the composer is visible at the bottom of the panel before the user scrolls
