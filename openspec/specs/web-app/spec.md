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
The client SHALL provide Inbox (open tasks without a project), Today (open tasks due today or earlier, with overdue tasks grouped first), Upcoming (open tasks due after today grouped by date), Completed (completed tasks newest first, grouped by the day they were completed), and one view per project (its open tasks). "Today" in these views is the user's logical today (OpenSpec `date-time-preferences`, "Logical today"): the calendar date, or the previous one while the local time is before the user's day start.

#### Scenario: Overdue grouping
- **WHEN** Today is opened and there are tasks due before today
- **THEN** they are listed under an "Overdue" heading above today's tasks

#### Scenario: Upcoming grouping
- **WHEN** Upcoming is opened
- **THEN** tasks are grouped by due date with "Tomorrow" and weekday headings in ascending order

#### Scenario: Today after midnight with a day start
- **WHEN** the user's day start is `04:00`, it is 01:30 on Thursday, and tasks are due on Wednesday and on Thursday
- **THEN** Today lists Wednesday's tasks under "Today" and none under "Overdue", and Upcoming lists Thursday's under "Tomorrow"

### Requirement: Task detail panel
Opening a task SHALL show a panel in the shell's panel slot (see `app-shell`) for editing title, notes, project, priority, dates and every other task property, with complete, delete and close actions. The panel SHALL show only the properties that have a value and offer the rest from an Add menu. A task SHALL open in the panel from Enter on a selected row, from Open details or `Shift+Enter` in the inline editor, and from a click on a row's title when the inline editor does not apply (see `task-list-presentation` "Inline title editing"). On narrow screens the panel SHALL open as a full-screen sheet over the list.

#### Scenario: Open from the list
- **WHEN** the user presses Enter on a selected task, or taps a task's title on a touch screen
- **THEN** the detail panel opens with that task's fields and the address carries the task id

#### Scenario: Click edits in place on a desktop
- **WHEN** the panel is closed and the user clicks a task's title with a mouse on a 1280 px wide screen
- **THEN** the title becomes editable in the list and the panel does not open

#### Scenario: Empty task shows few things
- **WHEN** the user opens a task with a title, a project and nothing else
- **THEN** the panel shows the title, the notes placeholder, the project, the When and priority values, the subtask line and the Add menu, and no other property

### Requirement: Keyboard navigation
Every primary action SHALL be reachable from the keyboard: `q` quick add, `j`/`k` (or arrows) move, Enter opens, `F2` edits the selected task's title in place, `c` completes or reopens, `1`–`4` set priority, Delete deletes, `g` then `i`/`t`/`u`/`c`/`s` navigates, `g` then `p` opens Inbox triage, Escape closes the panel or clears the selection, `?` lists shortcuts, and `Ctrl`/`⌘`+`K` opens the palette. Shortcuts SHALL not fire while typing in a field, except `Ctrl`/`⌘`+`K` outside the notes editor.

#### Scenario: Navigate with g then t
- **WHEN** focus is not in a text field and the user presses `g` then `t`
- **THEN** the Today view opens

#### Scenario: Typing is not intercepted
- **WHEN** the user types the letter `c` into the quick-add field
- **THEN** no task is completed

#### Scenario: Process the Inbox with g then p
- **WHEN** focus is not in a text field and the user presses `g` then `p`
- **THEN** the Inbox triage mode opens, and the `?` overlay lists `g` then `p` under "Go to a view"

#### Scenario: Palette from a field
- **WHEN** focus is in the Filter view's query input and the user presses `Ctrl+K`
- **THEN** the palette opens and the query text is kept

#### Scenario: Cheat sheet lists the context
- **WHEN** the user presses `?` in a project list
- **THEN** the cheat sheet opens with the list shortcuts first, as specified in `keyboard-shortcuts`

#### Scenario: Rename in place from the keyboard
- **WHEN** a task is selected and the user presses `F2`, types a new title and presses Enter
- **THEN** the title is saved in the list without opening the panel

### Requirement: Keyboard navigation to the review and statistics
Outside text fields, `g` then `r` SHALL open the weekly Review and `g` then `Shift+S` SHALL open Statistics, like the other `g` navigation keys (OpenSpec change `stats-and-review`).

#### Scenario: Navigate to the review and the statistics
- **WHEN** focus is not in a text field and the user presses `g` then `r`, and later `g` then `Shift+S`
- **THEN** the Review screen opens, and then the Statistics screen

### Requirement: Shortcuts come from the registry
Every shortcut SHALL come from the registry in `keyboard-shortcuts`.

#### Scenario: One source for every binding
- **WHEN** a view handles a key as a shortcut
- **THEN** that binding is declared in the `keyboard-shortcuts` registry, and the cheat sheet lists it from there

### Requirement: Account screens
The client SHALL show the owner setup form on a fresh server, a sign-in form otherwise, a sign-up option only when the server allows it, and SHALL show server-side errors: translated by their code when the client knows the code (OpenSpec `localization`), else the server's message verbatim.

#### Scenario: Setup on fresh server
- **WHEN** the client loads against a server that reports setup required
- **THEN** the create-owner form is shown and no sign-in form

#### Scenario: Known error code in the user's language
- **WHEN** the language is German and sign-in fails with code `invalid_credentials`
- **THEN** the form shows the German message for that code

#### Scenario: Unknown error code
- **WHEN** the server answers with a code the client does not know
- **THEN** the form shows the server's message as received

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
The layout SHALL work from 360 px wide phones to desktops. Below 768 px the sidebar SHALL be a drawer opened from the More tab, and a bottom tab bar SHALL offer Today, Inbox, Upcoming, Search and More, as specified in `app-shell`. It SHALL be light or dark according to the user's appearance mode, which follows the system light or dark preference by default.

#### Scenario: Phone layout
- **WHEN** the viewport is narrower than 768 px
- **THEN** the sidebar is hidden behind the More tab, the task list uses the full width, and the tab bar is visible above the bottom safe area

#### Scenario: Mode overrides the system
- **WHEN** the system prefers light and the user's appearance mode is `dark`
- **THEN** the app renders dark on phones and desktops alike

### Requirement: Render failure containment
A rendering error SHALL show a recoverable message with a reload action instead of a blank page, and SHALL not lose local data. An error in one screen, the task panel or an overlay (help, assistant, command palette, Vim layer, display screen) SHALL replace only that part with the message and a Reload button; the sidebar and the rest of the shell SHALL keep working, and navigating to another screen SHALL try again.

#### Scenario: Unexpected render error
- **WHEN** a component throws while rendering
- **THEN** the user sees an error message and a Reload button, and their data is intact after reloading

#### Scenario: One screen fails
- **WHEN** the code of one screen fails to load or render
- **THEN** that screen shows the message with Reload while the sidebar still navigates, and another screen opens normally

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
In Normal mode `:` SHALL open a one-line command input with completion over `inbox`, `today`, `upcoming`, `completed`, `settings`, `project <name>` (prefix match), `new <title>`, `triage` (the Inbox triage mode, OpenSpec `inbox-triage`), `q` (close panel or clear selection), `sync` and `help`. Enter runs the command, Escape cancels, and an unknown command SHALL show a message without side effects.

#### Scenario: Navigate by command
- **WHEN** the user types `:tod` and accepts the completion with Enter
- **THEN** the Today view opens and the indicator returns to Normal

#### Scenario: Unknown command
- **WHEN** the user runs `:frobnicate`
- **THEN** a message "Unknown command: frobnicate" is shown and nothing else changes

#### Scenario: Triage by command
- **WHEN** the user runs `:triage`
- **THEN** the Inbox triage mode opens and the indicator returns to Normal

### Requirement: Commands write through the local-first path
Commands that write data SHALL use the same local-first path as the equivalent interface action, so they work offline and converge like any edit.

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
The panel SHALL show, top to bottom: a sticky header with the task's checkbox, the editable title wrapping to at most two lines, a menu holding Delete, Copy link, Expand, Attach and the less frequent actions, and Close; the notes (a single placeholder line until focused, the editor otherwise, clamped at rest when long); the facet lines and the Add control; the subtasks as a checklist with its count; the attachments list only when there are attachments; and the tabbed area with Comments, Activity and History.

#### Scenario: Delete from the header menu
- **WHEN** the user opens the header menu and chooses Delete
- **THEN** the task moves to the Trash, the panel closes and a toast offers Undo

#### Scenario: Scrolled panel keeps its context
- **WHEN** the user scrolls the panel down to the comments
- **THEN** the checkbox and title stay visible at the top of the panel

#### Scenario: Long title
- **WHEN** the user opens a task whose title is wider than the panel
- **THEN** the title wraps onto a second line in the header and remains editable in place, and no subtask count is shown in the header

### Requirement: Task panel tabs
The tabbed area SHALL offer Comments (with the comment count), Activity, History and Time as tabs reachable with the keyboard (arrow keys between tabs, Tab into the content). Comments SHALL be the default tab; the last chosen tab SHALL be remembered on the device only. The task's created and completed times SHALL be the first entries of Activity. The tab bar SHALL follow "Conversation tabs stay reachable".

#### Scenario: Remembered tab
- **WHEN** the user opens the Activity tab, closes the panel and opens another task
- **THEN** the Activity tab is shown for that task on this device

#### Scenario: Activity starts with the lifecycle
- **WHEN** the user opens the Activity tab of a completed task
- **THEN** its created time and its completed time are the first entries

### Requirement: Task panel comment composer
The comment composer SHALL be pinned to the bottom of the panel while Comments is shown, resting as a single line that expands to the full composer (attach, submit, the submit key hint) when focused, when it holds a draft or a reply target, or when `Shift+C` is pressed; `Shift+C` SHALL switch to Comments and focus the composer.

#### Scenario: Shortcut to the composer
- **WHEN** the History tab is open and the user presses `Shift+C` outside a text field
- **THEN** the Comments tab is shown, the composer is expanded and has focus

#### Scenario: Composer without scrolling
- **WHEN** a task with thirty comments is opened
- **THEN** the composer line is visible at the bottom of the panel before the user scrolls

#### Scenario: At rest
- **WHEN** a task without a draft is opened and nothing is focused
- **THEN** the composer is one line reading "Write a comment…" with no buttons under it, and the Comments list has the space the full composer used

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

### Requirement: Completed logbook
The Completed view SHALL list completed tasks newest first, grouped by the logical day of completion ("Today", "Yesterday", then weekday and date, with the year outside the current year), each group with its count. It SHALL render the newest 100 and offer a keyboard-reachable "Show more" that renders the next 100, with no fixed cap. It SHALL be computed from local data, work offline and follow synced completions and reopenings.

#### Scenario: Grouped by day
- **WHEN** the user completed two tasks today, one yesterday and one on Monday 2026-10-12, and today is Friday 2026-10-16
- **THEN** Completed shows "Today" with two tasks, "Yesterday" with one, then a heading for Monday 12 October with one

#### Scenario: Older history is reachable
- **WHEN** the user has 250 completed tasks and opens Completed
- **THEN** the newest 100 are listed with "Show more" naming 150 more, and pressing it twice lists all 250

#### Scenario: Offline and synced
- **WHEN** the device is offline, the user completes a task, and later another device's completion syncs in
- **THEN** each appears under its completion day without a reload, and reopening a task removes it from its group

#### Scenario: Completed after midnight with a day start
- **WHEN** the user's day start is `04:00` and a task was completed at 01:30 on Thursday 15 October
- **THEN** Completed lists it under Wednesday 14 October, and under "Today" while Wednesday is still the logical today

### Requirement: Screens read local data through the data layer

Screens in `web/src/app` SHALL read the device's local data only through the data layer in `web/src/lib`, never by opening the local database themselves; the lint run of `make check` SHALL fail on an import of the database module (other than the sign-out and storage-persistence calls) or a use of the database object in a screen, except in tests, test kits, stories and files explicitly allow-listed while another change moves them. Widely read lists (projects, labels, memberships, saved views, preferences, field definitions) SHALL come from one shared live read each, so every screen shows the same rows. Reads stay local: they work offline, and a change from another device appears on every open screen after sync without a reload.

#### Scenario: A screen opens the database

- **WHEN** a screen file in `web/src/app` imports the database object or reads a table directly
- **THEN** the lint run fails and points to the data layer

#### Scenario: A synced change reaches every screen

- **GIVEN** the sidebar, the command palette and a project header are open
- **WHEN** a project is renamed on another device and this device syncs, or the device is offline and the rename is made here
- **THEN** all three show the new name without a reload

### Requirement: One visibility rule for projects

Every screen SHALL apply the same rule to which projects it reads: projects in the Trash (deleted) SHALL be left out everywhere except the Trash, history and statistics; archived projects SHALL be included in the lists screens hand to pickers, quick add and saved views, which leave archived projects out themselves as their own requirements say, and SHALL be left out of browsing lists such as the sidebar tree. The quick add sheet SHALL treat projects exactly as the quick add line of the task views does. The rule is applied to local data, so it holds offline, and an archive, restore or deletion synced from another device moves the project in or out of every list on the next render.

#### Scenario: Archived project in quick add

- **GIVEN** a project "Old" is archived
- **WHEN** the user types `#Old` in the quick add sheet or in a view's quick add line
- **THEN** both treat it the same way, and neither files the task into the archived project

#### Scenario: Archived project in the sidebar and in a picker

- **GIVEN** a task in an archived project
- **WHEN** the sidebar and the task's project picker are shown
- **THEN** the sidebar tree does not list the archived project, and the picker lists it first, marked "archived", as the task's current project

#### Scenario: Deleted project

- **WHEN** a project is moved to the Trash on another device and this device syncs
- **THEN** it disappears from every list except the Trash, where it can be restored

### Requirement: Date-dependent views follow the clock
Today, Upcoming, Anytime, the Logbook headings, the habit streaks and the sidebar counts SHALL move to the new day within a minute of the user's day start (local midnight by default; and on a change of time zone or of the day start preference) while the app stays open, without a reload or a data change. This is local: it works offline, and no operation is written.

#### Scenario: Midnight with the app open
- **WHEN** the app shows Today at 23:58 and a task is due tomorrow
- **THEN** shortly after midnight the task is listed in Today and the sidebar's Today count includes it

#### Scenario: Day start with the app open
- **WHEN** the user's day start is `04:00`, the app shows Today at 03:58 on Thursday and a task is due on Thursday
- **THEN** at midnight nothing moves, and shortly after 04:00 the task is listed in Today and the sidebar's Today count includes it

#### Scenario: Preference synced in while open
- **WHEN** the app shows Today at 01:30 and the day start changes from `00:00` to `04:00` on another device, which syncs
- **THEN** Today re-groups to the previous day's tasks without a reload

### Requirement: Editing shortcuts respect the role
Every list shortcut that changes a task (including skip occurrence, this occurrence only, schedule in the Day view and edit estimate) SHALL do nothing for a task in a project where the user is a viewer, so no local change is made that the server would refuse. Shortcuts that only move the selection or open a task keep working.

#### Scenario: Viewer presses skip
- **WHEN** a viewer selects a recurring task of a shared project and presses Shift+K, Shift+O, s or e
- **THEN** the task is unchanged on the device, no copy is created, the Day view does not open and the panel does not open on the estimate

### Requirement: List actions report failures
An action started from the task list (a bulk key, park, duplicate, this occurrence only, adding a subtask, completing from the panel) that fails SHALL show its message as a toast instead of failing silently.

#### Scenario: Refused duplicate
- **WHEN** duplicating the selected task fails
- **THEN** a toast shows the reason and the list is unchanged

### Requirement: Recovery after a server upgrade
An open tab SHALL recover when the server moves to a new release: when a lazily loaded part of the app is gone, it SHALL reload once on its own (and show a "Reload to update" prompt if the part is still missing right after); when a new service worker takes control, or a newer tab upgrades the local database, it SHALL show a "Reload to update" prompt, and a tab whose database was upgraded elsewhere SHALL close its connection. Offline, the precached release keeps working; local data is untouched.

#### Scenario: Old chunk after an upgrade
- **WHEN** the server was upgraded and an open tab opens a screen whose code chunk no longer exists
- **THEN** the tab reloads into the new release

#### Scenario: New service worker
- **WHEN** a new release's service worker takes control of an open tab
- **THEN** the tab shows "A new version of OpenTodo is ready." with a "Reload to update" button

### Requirement: Missing files are not the app page
The server SHALL answer a request for a missing file under `assets/`, or for any path with a file extension, with 404, and SHALL keep answering extension-less paths with the app page.

#### Scenario: Old chunk requested
- **WHEN** a tab of the previous release requests `/assets/TaskDetail-<old hash>.js`
- **THEN** the server answers 404, not the app page

#### Scenario: Client route
- **WHEN** the browser navigates to `/project/<id>`
- **THEN** the server answers with the app page

### Requirement: Failed actions are shown
When a change the user makes is refused or fails to save (for example making a task its own subtask, a move the target does not allow, or a local database error), the client SHALL show the reason as a toast in the user's language instead of dropping it, and SHALL log promise rejections nobody handled. A refused change is not written, so nothing has to converge.

#### Scenario: Refused subtask
- **WHEN** the user indents a task under a task in another project, or drops a task onto itself
- **THEN** a toast shows the translated reason and the task is unchanged

### Requirement: Title draft survives remote changes
While the user is typing a new title in the task panel, a title change from another device SHALL not replace the text being typed; leaving the field SHALL save the draft as the user's edit, which converges by the normal last-writer-wins rule. An untouched title SHALL follow remote changes.

#### Scenario: Remote rename while typing
- **WHEN** the user is typing a new title and another device renames the task
- **THEN** the field keeps the user's text, and leaving it saves that text

### Requirement: Local data is kept by the browser
After sign-in the client SHALL ask the browser to keep its storage persistent, so the local copy is not evicted under storage pressure or after weeks without a visit; a refusal SHALL change nothing else.

#### Scenario: Persistent storage
- **WHEN** the user signs in on a browser that supports persistent storage
- **THEN** the app requests it once, and works the same whatever the answer

### Requirement: Task panel facets
The panel SHALL group the task's properties into four facet lines, each with a leading icon and parts separated by a middle dot: Where (project › section, the parent task, the origin), When (do on, repeat, deadline, start, evening, reminders, zone), How (priority, estimate, labels) and Who (assignee, blocked by, blocks). Where, When and How SHALL always be shown; Who SHALL be shown when any of its parts has a value. A part SHALL read with the words the list row uses for the same fact.

#### Scenario: Full task reads as four lines
- **WHEN** the user opens a task due tomorrow at 09:00 that repeats every 3 months, has a deadline in 9 days, a start two days ago, two reminders, priority 2, a 2 h estimate, three labels, is assigned to the user and waits for "Collect the numbers", in "Website launch › Doing"
- **THEN** the panel shows exactly four facet lines: "Website launch › Doing"; "Tomorrow 09:00 · every 3 months · deadline Sun 25 Oct, 9 days · since Wed 14 Oct · 2 reminders"; "P2 · 2 h" followed by the three label chips; "You · waits for Collect the numbers"

#### Scenario: Facet without values is hidden
- **WHEN** a task has no assignee, no blockers and nothing waits for it
- **THEN** no Who line is shown, and "Assignee" and "Blocked by" are offered in the Add menu

#### Scenario: Same words as the row
- **WHEN** a task is due today, repeats every day and is marked for the evening
- **THEN** its When line starts "Today · evening · every day", in the date tone the row uses

#### Scenario: Origin opens its source
- **WHEN** the user presses Enter on the origin part of a task captured from `https://example.org/post`
- **THEN** the page opens in a new tab, no editor opens, the panel stays as it was, and Remove origin in the panel's header menu clears the origin as one offline-capable write

#### Scenario: Viewer reads the lines
- **WHEN** a viewer of a shared project opens one of its tasks
- **THEN** the facet lines render as text, no part opens an editor, and the Add menu is absent

### Requirement: Facet editors are popovers
Activating a part SHALL open its editor as a popover anchored to the part from 640 px and as a bottom sheet below, with the facet's name and icon as its title and a footer offering Clear (when the part has a value) and Done. The panel's content SHALL not move while a popover is open. Done, Escape or a committed single-value edit SHALL close the popover and return focus to the part; Clear SHALL remove the value and close it.

#### Scenario: Clear from the footer
- **WHEN** the user opens the deadline part and chooses Clear
- **THEN** the deadline is removed, the popover closes, the When line no longer reads a deadline, and no "×" control is rendered on any line

#### Scenario: Layout stays
- **WHEN** the user opens the Do on part on a 1280×800 screen
- **THEN** the subtasks and the tabs keep their position in the panel while the popover is open

#### Scenario: Phone sheet
- **WHEN** the user taps the labels part on a 390 px wide screen
- **THEN** the labels editor opens as a bottom sheet with the facet's title and Done, and closing it returns to the panel scrolled where it was

### Requirement: When popover shows one segment
The When popover SHALL offer the segments Do on, Start, Deadline, Repeat and Reminders in a segmented control and show one at a time, starting on the segment of the part that opened it (Do on when opened from the Add menu or a shortcut that names no part). The Do on segment SHALL hold the date, the time, the Evening toggle and the zone control.

#### Scenario: Open on the clicked part
- **WHEN** the user activates the "2 reminders" part
- **THEN** the When popover opens on its Reminders segment with the first reminder control focused, and switching to Deadline shows only the deadline field

#### Scenario: Shortcut from the list
- **WHEN** a task is selected in a list and the user presses the deadline shortcut
- **THEN** the panel opens with the When popover on its Deadline segment and the date field focused

### Requirement: Add menu grouped by facet
The Add control SHALL list the properties that have no value under the headings Where, When, How and Who, each with its shortcut, omitting a heading with nothing under it. Picking an entry SHALL add the part to its facet line with its editor open and focused; closing the editor without a value SHALL remove the part again and focus the Add control.

#### Scenario: Add an estimate
- **WHEN** the user opens Add, picks Estimate under How, types `1h30` and presses Enter
- **THEN** the How line reads "P4 · 1 h 30" and focus is on the new part

#### Scenario: Cancel leaves no trace
- **WHEN** the user picks Deadline from Add and presses Escape without a date
- **THEN** the When line is unchanged and focus is on the Add control

### Requirement: Facet keyboard operation
Each part SHALL be in the tab order; Enter or Space SHALL open its editor; `1` to `4` SHALL keep setting the priority while focus is in the panel outside a text field. Viewers' parts SHALL not be focusable as controls.

#### Scenario: Move between parts
- **WHEN** the user tabs to the first part of the When line and presses Tab, then Enter
- **THEN** focus moves to the next part of the same line and its editor opens; Escape closes it with focus back on that part

### Requirement: Task panel notes clamp
In the panel, notes that are not focused SHALL be clamped to about eight lines with a "Show all" control when they are longer; focusing the notes or choosing Show all SHALL expand them for the rest of the time the task is open. The task page SHALL never clamp.

#### Scenario: Long note in the panel
- **WHEN** the user opens a task whose notes are forty lines long on a 1280×800 screen
- **THEN** the panel shows the first lines of the notes, a "Show all" line, and the facet lines below it without scrolling

#### Scenario: Editing expands
- **WHEN** the user clicks into the clamped notes
- **THEN** the whole note is shown and stays shown after the editor loses focus, until another task is opened

### Requirement: Popover triggers toggle
Activating the control that opened an anchored popover (a facet part, a picker trigger, a menu button) while that popover is open SHALL close it in one step, and it SHALL NOT reopen. Activating it while closed SHALL open it. A click on the trigger SHALL never count as a click outside the popover.

#### Scenario: Second click closes
- **WHEN** the When popover was opened from the Do on part and the user clicks the Do on part again
- **THEN** the popover closes, stays closed, and focus is on the Do on part

#### Scenario: No flicker
- **WHEN** the user clicks the Do on part ten times in a row
- **THEN** the popover is open after every odd click and closed after every even click, and is never closed and reopened within one click

#### Scenario: Keyboard toggle
- **WHEN** focus is on a facet part whose popover is open and the user presses Enter on the part
- **THEN** the popover closes and focus stays on the part

### Requirement: Do on segment
The Do on segment of the When popover SHALL show, in order: quick choices (Today, Tomorrow, This weekend, Next week, No date), each with the date it means; one date field that shows the chosen date in words in the user's date format, accepts typed dates and relative words, and previews what it understood before it is committed; a month calendar that is visible without opening anything; an "Add time" control that reveals a time field with suggested times; the Evening switch; and, only when a time is set, one line naming the time zone behaviour ("Floating time" or "Fixed to <city>") with a Change control. The segment SHALL NOT contain a clear button of its own (Clear is in the popover's footer), and SHALL NOT show the zone as a button-styled value.

#### Scenario: Pick tomorrow in one click
- **WHEN** the user opens the Do on part of an undated task and chooses Tomorrow
- **THEN** the task is due tomorrow, and the When line reads "Tomorrow"

#### Scenario: Typed date with a preview
- **WHEN** the user types `fri` into the date field
- **THEN** a line under the field reads the next Friday's date in words before Enter is pressed, and Enter sets it

#### Scenario: Dates in words
- **WHEN** the user's date format is day-month and the task is due 2026-10-22
- **THEN** the date field reads "Thu 22 Oct" and no field shows `10/22/2026`

#### Scenario: Adding a time
- **WHEN** the user chooses "Add time" and then the suggestion 09:00
- **THEN** the task is due at 09:00, the zone line "Floating time · Change" appears, and "Add time" is replaced by the time field and "Remove time"

#### Scenario: No zone without a time
- **WHEN** the task is due on a date with no time
- **THEN** the segment shows no zone line and no hint about time zones

### Requirement: Conversation tabs stay reachable
The tab bar of Comments, Activity, History and Time SHALL stay pinned under the panel header once the user has scrolled down to it, so the tabs are reachable without scrolling back up. Switching tabs SHALL keep the tab bar at the same position on screen, show the new tab's content from its start under the bar, and SHALL NOT make the panel jump, even when the new tab is shorter than the old one. The panel SHALL remain one scroll region.

#### Scenario: Switch while reading a long thread
- **WHEN** the user has scrolled the panel to the 10th of 14 comments and chooses Activity
- **THEN** the tab bar is still under the header at the same position, the Activity entries start right under it, and nothing else in the panel moves

#### Scenario: Short tab does not pull the page
- **WHEN** the user switches from Comments with 14 comments to Activity with 3 entries
- **THEN** the tab bar does not move on screen and the space below the entries is empty panel, not a jump

#### Scenario: Tabs pinned
- **WHEN** the user scrolls the panel past the subtasks into the comments
- **THEN** the tab bar stays visible directly under the sticky header
