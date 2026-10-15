# web-app Specification

## Purpose
Defines the installable client: the views it offers, quick capture, keyboard navigation, the detail panel, settings and the small-screen layout.

## Requirements

### Requirement: Installable progressive web app
The client SHALL ship a web app manifest and a service worker that precaches the application shell, so it can be installed to a home screen and opened offline. API responses SHALL never be served from the service worker cache.

#### Scenario: Install and open offline
- **WHEN** the user installs the app, then opens it without network
- **THEN** the shell loads and shows locally stored tasks

### Requirement: Standard views
The client SHALL provide Inbox (open tasks without a project), Today (open tasks due today or earlier, with overdue tasks grouped first), Upcoming (open tasks due after today grouped by date), Completed (most recent completions), and one view per project (its open tasks).

#### Scenario: Overdue grouping
- **WHEN** Today is opened and there are tasks due before today
- **THEN** they are listed under an "Overdue" heading above today's tasks

#### Scenario: Upcoming grouping
- **WHEN** Upcoming is opened
- **THEN** tasks are grouped by due date with "Tomorrow" and weekday headings in ascending order

### Requirement: Task detail panel
Opening a task SHALL show a panel for editing title, notes, project, priority and due date and time, with complete, delete and close actions. On narrow screens the panel SHALL overlay the list.

#### Scenario: Open from the list
- **WHEN** the user clicks a task's title or presses Enter on a selected task
- **THEN** the detail panel opens with that task's fields

### Requirement: Keyboard navigation
Every primary action SHALL be reachable from the keyboard: `q` quick add, `j`/`k` (or arrows) move, Enter opens, `c` completes or reopens, `1`–`4` set priority, Delete deletes, `g` then `i`/`t`/`u`/`c`/`s` navigates, Escape closes the panel or clears the selection, `?` lists shortcuts, and `Ctrl`/`⌘`+`K` opens the search and command palette. Shortcuts SHALL not fire while typing in a field, except `Ctrl`/`⌘`+`K` outside the notes editor.

#### Scenario: Navigate with g then t
- **WHEN** focus is not in a text field and the user presses `g` then `t`
- **THEN** the Today view opens

#### Scenario: Typing is not intercepted
- **WHEN** the user types the letter `c` into the quick-add field
- **THEN** no task is completed

#### Scenario: Palette from a field
- **WHEN** focus is in the Filter view's query input and the user presses `Ctrl+K`
- **THEN** the palette opens and the query text is kept

### Requirement: Account screens
The client SHALL show the owner setup form on a fresh server, a sign-in form otherwise, a sign-up option only when the server allows it, and SHALL show server-side error messages verbatim.

#### Scenario: Setup on fresh server
- **WHEN** the client loads against a server that reports setup required
- **THEN** the create-owner form is shown and no sign-in form

### Requirement: Settings
A settings view SHALL show the signed-in account, let the user download the JSON export, create, list and revoke API tokens, and sign out. Signing out SHALL clear the local copy of the data on that device. The settings are grouped into sections with their own pages, as described by `settings-navigation`.

#### Scenario: Token shown once
- **WHEN** the user creates a token
- **THEN** the secret is displayed with a notice that it will not be shown again and the token appears in the list

#### Scenario: Sign out from the Account section
- **WHEN** the user opens Settings → Account, selects Sign out and confirms in the dialog
- **THEN** unsynced changes are uploaded when online, the local copy is cleared and the sign-in screen is shown

#### Scenario: Sign out cancelled
- **WHEN** the user selects Sign out and then chooses Cancel in the dialog
- **THEN** nothing is cleared and the Account section stays open with focus on the Sign out button

### Requirement: Responsive layout and themes
The layout SHALL work from 360 px wide phones to desktops, with a collapsible sidebar on small screens. It SHALL be light or dark according to the user's appearance mode, which follows the system light or dark preference by default.

#### Scenario: Phone layout
- **WHEN** the viewport is narrower than 768 px
- **THEN** the sidebar is hidden behind a menu button and the task list uses the full width

#### Scenario: Mode overrides the system
- **WHEN** the system prefers light and the user's appearance mode is `dark`
- **THEN** the app renders dark on phones and desktops alike

### Requirement: Render failure containment
A rendering error SHALL show a recoverable message with a reload action instead of a blank page, and SHALL not lose local data.

#### Scenario: Unexpected render error
- **WHEN** a component throws while rendering
- **THEN** the user sees an error message and a Reload button, and their data is intact after reloading

### Requirement: Vim keybindings are opt-in
The settings view SHALL offer a "Vim keybindings" switch that is off by default. The preference SHALL be stored on the device only, SHALL take effect immediately without a reload, SHALL be readable offline, and SHALL NOT be synced or sent to the server; signing out clears it with the rest of the local data. Because it is device-local there is nothing to converge between devices.

#### Scenario: Default is off
- **WHEN** a user signs in on a device for the first time
- **THEN** the switch is off and every shortcut behaves exactly as specified in "Keyboard navigation"

#### Scenario: Toggle takes effect at once
- **WHEN** the user turns the switch on and returns to a task view
- **THEN** the mode indicator appears and Normal-mode bindings work without reloading the page

#### Scenario: Preference survives offline reload
- **WHEN** the switch is on and the installed app is reopened without network
- **THEN** Vim keybindings are still enabled

### Requirement: Modes and mode indicator
With Vim keybindings enabled the client SHALL be in exactly one of three modes: Normal (default), Insert (while a text field has focus) and Command (while the command line is open). The current mode SHALL be shown persistently in the shell. Mode is interface state only; it touches no task or project data and has no offline or convergence implications.

#### Scenario: Focusing a field enters Insert
- **WHEN** the user presses `q` or clicks into the quick-add field
- **THEN** the indicator shows Insert and letter keys type into the field

#### Scenario: Escape returns to Normal
- **WHEN** the user is in Insert or Command mode and presses Escape
- **THEN** focus leaves the field or command line, the indicator shows Normal, and any text already typed into a task field is kept

### Requirement: Normal-mode motions and counts
In Normal mode the client SHALL support a count prefix for `j`, `k`, `J` and `K` (`J`/`K` move the selected task in manual order), `gg`/`G` to select the first/last task, `dd` to delete it, `x` to complete or reopen it, `o` to open quick add after it and `i` to open its detail panel in Insert mode. With tasks ticked (`bulk-actions`), `x` and `dd` SHALL act on the ticked tasks. Task actions SHALL be applied locally first as operations, so they work offline and converge.

#### Scenario: Count prefix
- **WHEN** a task is selected and the user types `3j`
- **THEN** the selection moves down three tasks, clamped at the last task

#### Scenario: Delete with dd offline
- **WHEN** the device is offline and the user presses `d` twice with a task selected
- **THEN** the task is deleted immediately, the deletion is uploaded on the next sync, and other devices converge on the tombstone

#### Scenario: Incomplete sequence times out
- **WHEN** the user presses `d` once and nothing within one second
- **THEN** no task is deleted and the pending key is discarded

#### Scenario: Count before G or gg
- **WHEN** the user types `4G` or `4gg`
- **THEN** the fourth task of the list is selected

#### Scenario: Move the selected task with J
- **WHEN** a task is selected in a project list or the Inbox and the user types `2J`
- **THEN** the task moves down two places, recorded as position operations like Alt+Down

#### Scenario: a keeps its default meaning
- **WHEN** a task is selected and the user presses `a`
- **THEN** the inline subtask field opens as without Vim keybindings, which is Insert mode

#### Scenario: x with several tasks ticked
- **WHEN** Vim keybindings are on, the user ticks three tasks with Space and presses `x`
- **THEN** the three tasks are completed as one batch and a toast offers Undo

#### Scenario: Extend the selection in Vim mode
- **WHEN** Vim keybindings are on and the user presses Space on a row, then `Shift+↓`
- **THEN** that row and the next are ticked, while `J` still moves the cursor task down one place

### Requirement: Command line
In Normal mode `:` SHALL open a one-line command input with completion over `inbox`, `today`, `upcoming`, `completed`, `settings`, `project <name>` (prefix match), `new <title>`, `q` (close panel or clear selection), `sync` and `help`. Enter runs the command, Escape cancels, and an unknown command SHALL show a message without side effects. Commands that write data SHALL use the same local-first path as the equivalent interface action, so they work offline and converge like any edit.

#### Scenario: Navigate by command
- **WHEN** the user types `:tod` and accepts the completion with Enter
- **THEN** the Today view opens and the indicator returns to Normal

#### Scenario: Unknown command
- **WHEN** the user runs `:frobnicate`
- **THEN** a message "Unknown command: frobnicate" is shown and nothing else changes

#### Scenario: Create task by command while offline
- **WHEN** the device is offline, the user is in a project view and runs `:new Buy milk`
- **THEN** the task appears in that project immediately and syncs later like any quick-add entry

### Requirement: Existing shortcuts keep working
Enabling Vim keybindings SHALL NOT remove or change any shortcut specified in "Keyboard navigation": `q`, `j`/`k`, arrows, Enter, `c`, `1`–`4`, Delete, `g` + `i`/`t`/`u`/`c`/`s`, Escape and `?` SHALL behave as before in Normal mode. The `g` prefix SHALL serve both the existing targets and `gg`, and Vim bindings SHALL never fire while typing in a field.

#### Scenario: g prefix is shared
- **WHEN** the user presses `g` then `t`, and later `g` then `g`
- **THEN** the first opens Today and the second selects the first task

#### Scenario: Typing is not intercepted
- **WHEN** the user types `dd` into the quick-add field in Insert mode
- **THEN** the letters appear in the field and no task is deleted

### Requirement: Discoverable Vim help
When Vim keybindings are enabled the `?` overlay SHALL include a Vim section listing every added motion and command with a one-line description, and `:help` SHALL open the same overlay. When disabled the section SHALL be absent so the default help stays short.

#### Scenario: Help with Vim on
- **WHEN** Vim keybindings are on and the user presses `?`
- **THEN** the overlay lists the Normal-mode motions, counts and the command line alongside the default shortcuts

#### Scenario: Help with Vim off
- **WHEN** Vim keybindings are off and the user presses `?`
- **THEN** the overlay shows only the default shortcuts and a hint that Vim keybindings can be enabled in Settings

### Requirement: Overlays fit every screen
Every menu, popover, picker, dialog and toast SHALL be fully inside the viewport from 360 px wide up, with its close control visible and usable. Below 640 px menus, popovers and pickers SHALL open as bottom sheets across the screen width; from 640 px up they SHALL open next to their trigger, shifted or flipped to stay inside the viewport. A dialog taller than the screen SHALL become a full-screen sheet with a pinned header and close button.

#### Scenario: Notifications on a phone
- **WHEN** a user on a 390 px wide screen taps the bell
- **THEN** the notifications open as a bottom sheet across the screen, every entry is fully visible and the sheet closes with its close button or a tap outside

#### Scenario: Menu near the edge on a tablet
- **WHEN** a menu's trigger sits near the left edge of a 768 px screen
- **THEN** the menu opens shifted so that it is entirely on screen

#### Scenario: Long dialog
- **WHEN** a dialog's content is taller than the screen
- **THEN** it opens full screen, its content scrolls and its close button stays visible at the top

### Requirement: Consistent overlay behaviour
All overlays SHALL close with Escape and, except destructive confirmations, with a tap outside; move focus into themselves when opened and back to their trigger when closed; keep the page behind from scrolling while open; respect device safe areas; and expose their role and label to assistive technology.

#### Scenario: Escape and focus
- **WHEN** a keyboard user opens a menu and presses Escape
- **THEN** the menu closes and focus returns to the button that opened it

#### Scenario: Background stays put
- **WHEN** a user scrolls inside an open bottom sheet
- **THEN** only the sheet scrolls and the page behind it does not move

### Requirement: Phone layout rules
From 360 px wide up no screen SHALL scroll horizontally, except designated regions (board columns, week grid, wide tables) that scroll inside themselves. On touch screens interactive controls SHALL be at least 44×44 px and controls shown on hover SHALL always be visible. Long words and URLs SHALL wrap, layouts SHALL follow the visible viewport height and safe areas, and the on-screen keyboard SHALL not hide the focused field.

#### Scenario: Narrow phone
- **WHEN** any screen is shown 360 px wide
- **THEN** the page has no horizontal scrollbar and nothing is cut off at the edges

#### Scenario: Row menu on a touch screen
- **WHEN** a touch-screen user looks at the sidebar views or labels
- **THEN** their menu buttons are visible without hovering and at least 44 px in both directions

#### Scenario: Long URL in a comment
- **WHEN** a comment contains a 120-character URL
- **THEN** it wraps inside the comment and the page does not scroll sideways

### Requirement: Automated layout check
CI SHALL open every screen and every overlay at 360, 390 and 768 px wide, in light and dark themes, in Chromium and in WebKit, and SHALL fail when a page scrolls horizontally outside designated regions, an overlay or its close control is outside the viewport or not clickable, an overlay does not close with Escape and its close button, or a touch target is smaller than 44×44 px.

#### Scenario: A new popover overflows
- **WHEN** a change adds a popover that opens past the screen edge at 390 px
- **THEN** the layout job fails and names the screen, overlay, viewport and engine, with a screenshot

#### Scenario: Safari-only bug
- **WHEN** an overlay works in Chromium but cannot be closed in WebKit
- **THEN** the layout job fails for WebKit

### Requirement: Task panel layout
The panel SHALL show, top to bottom: a header with Complete, Close and a menu holding Delete and the less frequent actions; the title and notes; a properties area listing each field as a labelled row that shows its current value and turns into its editor on click or Enter; the subtasks; and a tabbed area with Comments, Activity and History. Empty fields SHALL read as a quiet placeholder ("No due date"), not as an empty control.

#### Scenario: Values read as values
- **WHEN** the user opens a task due tomorrow at 09:00 with priority 2 in "Work"
- **THEN** the properties rows read "Work", "P2" and the due date and time in the user's format, without visible input boxes

#### Scenario: Edit a row with the keyboard
- **WHEN** the user tabs to the Due row and presses Enter
- **THEN** the due editor opens with focus in it, and Escape closes it with focus back on the row

#### Scenario: Delete from the header menu
- **WHEN** the user opens the header menu and chooses Delete
- **THEN** the task moves to the Trash and the panel closes

### Requirement: Task panel tabs
The tabbed area SHALL offer Comments (with the comment count), Activity and History as tabs reachable with the keyboard (arrow keys between tabs, Tab into the content). Comments SHALL be the default tab; the last chosen tab SHALL be remembered on the device only. `Shift+C` SHALL switch to Comments and focus the composer.

#### Scenario: Shortcut to the composer
- **WHEN** the History tab is open and the user presses `Shift+C` outside a text field
- **THEN** the Comments tab is shown and the composer has focus

#### Scenario: Remembered tab
- **WHEN** the user opens the Activity tab, closes the panel and opens another task
- **THEN** the Activity tab is shown for that task on this device

### Requirement: Task panel in viewer mode
For a viewer of a shared project every property row SHALL render as read-only text without an editor, the header SHALL omit Complete and Delete, and the Comments tab SHALL remain writable because viewers may comment.

#### Scenario: Viewer opens a task
- **WHEN** a viewer opens a task in a shared project
- **THEN** the properties cannot be edited, a read-only note is shown, and the comment composer is available

### Requirement: Ask screen
The app SHALL offer an Ask screen, reachable from the sidebar and with the keyboard sequence `g` then `k`, showing the Ask composer and the full skill list. When the assistant is not available to the user, the screen SHALL explain why (not enabled on this server, or not available for encrypted accounts) and SHALL NOT appear in the sidebar for members.

#### Scenario: Keyboard
- **WHEN** a user with the assistant available presses `g` then `k`
- **THEN** the Ask screen opens with focus in the composer

#### Scenario: Encrypted account
- **WHEN** a user whose account uses end-to-end encryption opens the Ask screen by its address
- **THEN** it explains that the assistant cannot read encrypted tasks and shows no composer
