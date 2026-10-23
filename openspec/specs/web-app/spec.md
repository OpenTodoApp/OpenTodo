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
The client SHALL provide Inbox (the Inbox tasks of OpenSpec `project-organization`, "Inbox is the default container": open, without a project and not scheduled), Today (open tasks due today or earlier, with the tasks due before today grouped first under "Earlier"), Upcoming (open tasks due after today grouped by date), Completed (completed tasks newest first, grouped by the day they were completed), and one view per project (its open tasks). The Inbox list SHALL end with a group "Planned, no project" with its count while at least one open scheduled task without a project exists. The group SHALL be folded by default, and whether it is open SHALL be remembered on the device; open, it SHALL list those tasks as ordinary rows (open, complete, act on them, drag them onto a project), ordered by their do-on date, then their start date, with Someday last. Its header SHALL offer "Open as filter", which opens the Filter view with the query `no project`. The group SHALL NOT count as part of the Inbox: the Inbox's empty state, Process the Inbox and its count read only the Inbox's own tasks, and with only planned tasks left the Inbox shows its empty state with the folded group below it. The group is derived from synced task fields, so it shows the same tasks on every device once they have synced, and offline it shows what the device holds. When quick add in the Inbox creates a task that is scheduled (its line sets a date, a start or Someday), the client SHALL announce where it went (for example "Added to Friday") with a control that opens that view, instead of leaving the user to wonder why it did not appear. "Today" in these views is the user's logical today (OpenSpec `date-time-preferences`, "Logical today"): the calendar date, or the previous one while the local time is before the user's day start.

The Earlier group of Today SHALL carry two actions in its header, visible at all times: **Move all to today**, which sets today as the due date of every task in the group keeping each task's time of day, and **Reschedule…**, which opens the date choices of the bulk Actions menu (today, tomorrow, next week, pick a date) and applies the choice to every task in the group. Both SHALL write one batch with the Undo toast of bulk actions, apply locally at once, work offline and converge per task and field. A task in the group because of a past deadline only SHALL get a due date and keep its deadline; a repeating task SHALL move its occurrence as a single date change does. The same two actions SHALL be command palette commands, "Move earlier tasks to today" and "Reschedule earlier tasks…", offered while Today's Earlier group is not empty, with no key of their own.

#### Scenario: Overdue grouping
- **WHEN** Today is opened and there are tasks due before today
- **THEN** they are listed under an "Earlier" heading above today's tasks (the group is named Earlier; "overdue" is not a word of the interface, see `task-list-presentation` "Words for tasks that are late")

#### Scenario: Move all to today
- **WHEN** Earlier holds a task due Monday at 09:30 and a task due Tuesday without a time, and the user activates "Move all to today"
- **THEN** both are due today, the first at 09:30, they join today's group at once, the Earlier group is gone, and a toast reads "2 tasks moved to today" with Undo

#### Scenario: Reschedule offline
- **WHEN** the device is offline and the user chooses Reschedule… → Tomorrow on an Earlier group of four tasks
- **THEN** the four tasks are due tomorrow at once, leave Today, are queued as one batch and reach the other devices after the next sync

#### Scenario: Undo
- **WHEN** the user moved three earlier tasks to today and activates Undo within ten seconds
- **THEN** each task has its previous due date again and is back in Earlier, as one batch

#### Scenario: Deadline-only task
- **WHEN** Earlier holds a task with no due date whose deadline was yesterday and the user activates "Move all to today"
- **THEN** the task is due today and its deadline is unchanged

#### Scenario: Palette command
- **WHEN** Earlier holds two tasks and the user opens the command palette and types "earlier"
- **THEN** "Move earlier tasks to today" and "Reschedule earlier tasks…" are offered, and neither is offered while Earlier is empty

#### Scenario: Upcoming grouping
- **WHEN** Upcoming is opened
- **THEN** tasks are grouped by due date with "Tomorrow" and weekday headings in ascending order

#### Scenario: Today after midnight with a day start
- **WHEN** the user's day start is `04:00`, it is 01:30 on Thursday, and tasks are due on Wednesday and on Thursday
- **THEN** Today lists Wednesday's tasks under "Today" and none under "Earlier", and Upcoming lists Thursday's under "Tomorrow"

#### Scenario: Where planned tasks went
- **WHEN** the Inbox holds two tasks and three tasks without a project are due later this week
- **THEN** the Inbox lists its two tasks, then a folded group "Planned, no project" with the count 3; opening it lists the three tasks in place, and its "Open as filter" opens Filter with `no project`

#### Scenario: Inbox zero with planned tasks
- **WHEN** every task without a project has a date, a start date or Someday
- **THEN** the Inbox shows its empty state and Process the Inbox is not offered, with the folded group "Planned, no project" below it

#### Scenario: The group remembers being opened
- **WHEN** the user opens the group, leaves the Inbox and comes back on the same device
- **THEN** the group is still open; on another device it is folded until opened there
#### Scenario: Quick add with a date in the Inbox
- **WHEN** the user types `Call the bank friday` in the Inbox quick add and presses Enter
- **THEN** the task is created due Friday without a project, it is not listed in the Inbox, and an announcement reads "Added to Friday" with a control that opens Upcoming at Friday

### Requirement: Task detail panel
Opening a task SHALL show it as its own page at `/task/<id>` (see "Task page") for editing title, notes, project, priority, dates and every other task property, with complete, delete and close actions. The page SHALL show every property in its facts column, a property without a value as a quiet action that sets it (see "Task facts column"). A task SHALL open from Enter on a selected row, from Open details or `Shift+Enter` in the inline editor, and from a click on a row's title when the inline editor does not apply (see `task-list-presentation` "Inline title editing"). Only a page that keeps a split (Process the Inbox) SHALL show the task in the shell's panel slot beside its content instead, and only from 1024 px; below that it opens the page too. Where another capability says the task panel or the detail panel, it means the task page, or the docked panel on a page that keeps a split.

#### Scenario: Open from the list
- **WHEN** the user presses Enter on a selected task, or taps a task's title on a touch screen
- **THEN** the task opens as its page, the address is `/task/<id>`, and nothing is docked beside the list

#### Scenario: Click edits in place on a desktop
- **WHEN** the user clicks a task's title with a mouse on a 1280 px wide screen
- **THEN** the title becomes editable in the list and the task page does not open

#### Scenario: Empty task shows few things
- **WHEN** the user opens a task with a title, a project and nothing else
- **THEN** the facts column shows the priority and the project as values, every other fact as a quiet action such as "Set a deadline", and no empty form field

#### Scenario: Open on a phone
- **WHEN** the user opens a task from Today on a 390×844 phone
- **THEN** the task page fills the screen with Back to Today in the bar, the facts under the notes, and no tab bar or add button

#### Scenario: Drag the handle to close
- **WHEN** the user opens a task on a 390 px phone
- **THEN** it opens as its page with no handle and no scrim, and Back in the bar returns to the list where it was

#### Scenario: Reading comments does not close the sheet
- **WHEN** the user scrolls the task page down to the comments and drags down on a comment
- **THEN** the page scrolls and nothing closes

#### Scenario: Scrim and Close
- **WHEN** the user chooses Close on the task page, or Back on a phone
- **THEN** the list it was opened from shows with the task's row selected

#### Scenario: Triage keeps its split
- **WHEN** the user presses Enter on the card in Process the Inbox on a 1280 px wide screen
- **THEN** the task opens in the panel beside the card, and Escape closes it and returns to the card

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
Every menu, popover, picker, dialog and toast SHALL be fully inside the viewport from 360 px wide up, with its close control visible and usable. Below 640 px menus, popovers and pickers SHALL open as bottom sheets across the screen width with a drag handle, at most 90 percent of the viewport height, closing on a drag down on the handle as well as on their close control and a tap outside; from 640 px up they SHALL open next to their trigger, shifted or flipped to stay inside the viewport. A dialog taller than the screen SHALL become a full-screen sheet with a pinned header and close button. A toast SHALL never cover the focused control (it sits above the tab bar on a phone and moves up while a sheet is open).

#### Scenario: Notifications on a phone
- **WHEN** a user on a 390 px wide screen taps the bell
- **THEN** the notifications open as a bottom sheet across the screen with a drag handle, every entry is fully visible and the sheet closes with its close button, a drag down on the handle or a tap outside

#### Scenario: Menu near the edge on a tablet
- **WHEN** a menu's trigger sits near the left edge of a 768 px screen
- **THEN** the menu opens shifted so that it is entirely on screen

#### Scenario: Long dialog
- **WHEN** a dialog's content is taller than the screen
- **THEN** it opens full screen, its content scrolls and its close button stays visible at the top

#### Scenario: Toast above the tab bar
- **WHEN** the user completes a task on a phone and the Undo toast appears
- **THEN** the toast sits above the tab bar and covers no row, and Undo is at least 48 px tall

### Requirement: Consistent overlay behaviour
All overlays SHALL close with Escape and, except destructive confirmations, with a tap outside; move focus into themselves when opened and back to their trigger when closed; keep the page behind from scrolling while open; respect device safe areas; and expose their role and label to assistive technology.

#### Scenario: Escape and focus
- **WHEN** a keyboard user opens a menu and presses Escape
- **THEN** the menu closes and focus returns to the button that opened it

#### Scenario: Background stays put
- **WHEN** a user scrolls inside an open bottom sheet
- **THEN** only the sheet scrolls and the page behind it does not move

### Requirement: Phone layout rules
From 360 px wide up no screen SHALL scroll horizontally, in every interface language, except designated regions (board columns, week grid, wide tables) that scroll inside themselves. On touch screens interactive controls SHALL be at least 48×48 px, or at least 44×44 px with 8 px of space to the next control, and controls shown on hover SHALL always be visible. Long words and URLs SHALL wrap, layouts SHALL follow the visible viewport height and safe areas, and the on-screen keyboard SHALL not hide the focused field, inside a sheet included. A fixed control SHALL NOT cover content: a list reserves the room a floating control needs under its last row.

#### Scenario: Narrow phone
- **WHEN** any screen is shown 360 px wide
- **THEN** the page has no horizontal scrollbar and nothing is cut off at the edges

#### Scenario: Narrow phone in German
- **WHEN** the interface language is German or French and Today, a project, Settings and the drawer are shown 360 px wide
- **THEN** no page scrolls sideways and no control is clipped, with the longer labels wrapped or truncated with their full name in the accessible name

#### Scenario: Row menu on a touch screen
- **WHEN** a touch-screen user looks at the sidebar views or labels
- **THEN** their menu buttons are visible without hovering and at least 48 px in both directions

#### Scenario: Long URL in a comment
- **WHEN** a comment contains a 120-character URL
- **THEN** it wraps inside the comment and the page does not scroll sideways

#### Scenario: Keyboard over a sheet
- **WHEN** the user focuses the comment composer at the bottom of the task sheet on a phone
- **THEN** the sheet scrolls so the composer stays above the keyboard and the sticky header stays visible

### Requirement: Automated layout check
CI SHALL open every screen and every overlay at 360, 390 and 768 px wide, in light and dark themes, in Chromium and in WebKit, and SHALL fail when a page scrolls horizontally outside designated regions, an overlay or its close control is outside the viewport or not clickable, an overlay does not close with Escape and its close button, or a touch target is smaller than 44×44 px.

#### Scenario: A new popover overflows
- **WHEN** a change adds a popover that opens past the screen edge at 390 px
- **THEN** the layout job fails and names the screen, overlay, viewport and engine, with a screenshot

#### Scenario: Safari-only bug
- **WHEN** an overlay works in Chromium but cannot be closed in WebKit
- **THEN** the layout job fails for WebKit

### Requirement: Task panel layout
The task page SHALL show, top to bottom: a compact header with the breadcrumb (the task's project, its parent task when it has one, and the task), the task's place in the list it was opened from ("4 / 12") with the next and previous task, a menu holding Delete, Copy link, Attach and the less frequent actions, and Close; then the content column with the task's checkbox and editable title, the notes (never clamped), an Attach control, the project's custom fields, the subtasks as one bordered block with their count and progress, the attachments list only when there are attachments, and the tabbed area with Comments, Activity, History and Time, the comment composer pinned to the bottom; and the facts column beside the content from 1024 px, under the notes below that. The docked panel of a page that keeps a split SHALL keep the earlier panel layout: the sticky header with the checkbox, the title, the menu (with Expand) and Close, the clamped notes, the facet lines with Add, the subtasks, the attachments and the tabs.

#### Scenario: Delete from the header menu
- **WHEN** the user opens the header menu on the task page and chooses Delete
- **THEN** the task moves to the Trash, the page returns to the list it was opened from, and a toast offers Undo

#### Scenario: Scrolled panel keeps its context
- **WHEN** the user scrolls the task page down to the comments
- **THEN** the header with the breadcrumb, the place in the list and Close stays visible, and on a wide screen so does the facts column

#### Scenario: Long title
- **WHEN** the user opens a task whose title is wider than the content column
- **THEN** the title wraps under the checkbox and remains editable in place, and the breadcrumb shortens its last crumb with an ellipsis

### Requirement: Task panel tabs
The tabbed area SHALL offer Comments (with the comment count), Activity, History and Time (with the tracked total when there is one) as tabs reachable with the keyboard (arrow keys between tabs, Tab into the content). Comments SHALL be the default tab; the last chosen tab SHALL be remembered on the device only. The task's created and completed times SHALL be the first entries of Activity. The Time tab SHALL hold the task's time entries as the time-tracking capability defines them.

#### Scenario: Remembered tab
- **WHEN** the user opens the Activity tab, closes the panel and opens another task
- **THEN** the Activity tab is shown for that task on this device

#### Scenario: Activity starts with the lifecycle
- **WHEN** the user opens the Activity tab of a completed task
- **THEN** its created time and its completed time are the first entries

#### Scenario: Time tab by keyboard
- **WHEN** the panel is open on a task with 35 minutes tracked and the user moves to the tabs and presses the right arrow until "Time · 35m"
- **THEN** the Time tab shows the entries, Tab reaches Start tracking first, and Enter starts an entry whose row appears at the top with a ticking duration

### Requirement: Task panel comment composer
The comment composer SHALL be pinned to the bottom of the task page's content column (of the panel when docked) while Comments is shown, resting as a single line that expands to the full composer (the rich-text editor, attach, the submit key hint and the round Send control of the shared composer frame, see `comments` "Composer behaviour") when focused, when it holds a draft or a reply target, or when `Shift+C` is pressed; `Shift+C` SHALL switch to Comments and focus the composer. The editor's own keys SHALL apply only while the composer has focus and SHALL never fire a page shortcut.

#### Scenario: Shortcut to the composer
- **WHEN** the History tab is open and the user presses `Shift+C` outside a text field
- **THEN** the Comments tab is shown, the composer is expanded with the editor and has focus

#### Scenario: Composer without scrolling
- **WHEN** a task with thirty comments is opened
- **THEN** the composer line is visible at the bottom of the page before the user scrolls

#### Scenario: At rest
- **WHEN** a task without a draft is opened and nothing is focused
- **THEN** the composer is one line reading "Write a comment…" with no buttons under it, and the Comments list has the space the full composer used

#### Scenario: Editor keys stay in the editor
- **WHEN** the composer has focus and the user presses `c` or `1`
- **THEN** the character is typed into the comment and the task is neither completed nor reprioritised

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

### Requirement: Keyboard navigation to Focus
Outside text fields, `g` then `Shift+F` SHALL open the Focus screen (OpenSpec change `focus-mode`), like the other `g` navigation keys, and the `?` cheat sheet SHALL list it under "Go to a view". On the Focus screen itself Space, Enter, Esc, `b` and `n` SHALL be the view's own keys and SHALL not run any list or panel shortcut.

#### Scenario: Navigate to Focus
- **WHEN** focus is not in a text field and the user presses `g` then `Shift+F`
- **THEN** the Focus screen opens on the first task of today's focus, or on its task picker when there is none

#### Scenario: No list keys on the Focus screen
- **WHEN** the Focus screen is shown and the user presses `c` or `j`
- **THEN** nothing happens, because the screen hosts no task list

### Requirement: App icons
The installed app's icons SHALL be the colour variant of the brand mark: the SVG favicon, the 192 and 512 px manifest icons, a 512 px maskable icon and the Apple touch icon, all generated from the one brand source and served under the same paths as today so that installed apps and bookmarks update their icon on the next load without a manifest path change. The sign-in, setup, reset, invitation and email screens SHALL show the mono mark beside the wordmark instead of an image of the icon. The precached shell SHALL include the new icon files, so an installed app shows its icon offline.

#### Scenario: Installed icon updates
- **WHEN** a person who installed the app before this version opens it after the update
- **THEN** the home screen or dock icon shows the brand mark on the slate square after the browser's next icon refresh, and the app's manifest lists the same icon paths as before

#### Scenario: Sign-in shows the mark
- **WHEN** a visitor opens the sign-in screen in light and in dark
- **THEN** the card starts with the mono mark at 32 px and the wordmark, and no raster icon is requested for the screen

#### Scenario: Offline icon
- **WHEN** the installed app is opened without network
- **THEN** the shell and its icons load from the precache and the browser shows the brand mark in the title bar

### Requirement: Overlay motion
Each overlay kind SHALL enter and leave with a fixed motion: a dialog from 640 px up fades and scales up slightly within the emphasis duration and leaves in about three quarters of it; a phone sheet slides up within the emphasis duration and slides down in about three quarters of it; the task panel slides in from its edge within the emphasis duration when opened from closed and slides out in about three quarters of it, and switching the task it shows SHALL NOT replay the slide; a toast slides up within the emphasis duration and fades out; menus, popovers, tooltips and the command palette fade in within the interface duration and close at once. Entrances SHALL use the spring ease-out; an overlay SHALL accept input from its first frame; focus SHALL move as "Consistent overlay behaviour" requires regardless of motion. Under reduced motion every overlay fades only; under no motion it appears and disappears at once.

#### Scenario: Dialog on a desktop
- **WHEN** the user opens the share dialog at 1280 px
- **THEN** the dialog fades in and scales from slightly smaller to its size within 250 ms and its first field has focus before the animation ends

#### Scenario: Panel switches tasks without replaying
- **WHEN** the task panel is open on one task and the user presses the open key on another row
- **THEN** the panel's content changes with no slide

#### Scenario: Menu closes at once
- **WHEN** the user picks an item in a row menu
- **THEN** the menu disappears with no exit animation and the action's effect is visible immediately

#### Scenario: Reduced motion
- **WHEN** reduced motion is requested and the user opens a phone sheet
- **THEN** the sheet fades in with no slide and closes with a fade

### Requirement: Interface audit tour
The repository SHALL provide one command that opens every entry of the screen inventory on the built web app with a seeded account at 360, 768 and 1280 px wide, in light and dark, in English and German, saves a screenshot of each, measures the interface budget (rows of chrome above a list's first item, task properties visible by default, primary sidebar destinations, vertical scroll regions), WCAG 2.2 AA violations, each audited interface rule (OpenSpec `design-system` "Audited interface rules"), the time from navigation to the first task row rendered from the local copy while the server is unreachable, and story coverage of the core screens, and writes a JSON report and an HTML contact sheet. The tour SHALL change nothing in the app or the repository, SHALL run in CI on every code change as a non-blocking job that uploads the report, and SHALL have a strict mode that fails on budget, overflow, story-coverage and reduced-motion violations once the maintainer turns it on. Under reduced motion the tour SHALL watch every overlay of the inventory as it opens, at 1280 px with a mouse and at 360 px as a touch device, completing a task in Today, and dragging a card to the next board column, a task to the next day of the Plan and a block down an hour in the Week, from before the action until it settles, so a movement that ends before a snapshot is still reported. Each violation SHALL name the screen, the width, the theme, the language, the rule and the element.

#### Scenario: Full tour on a code change
- **WHEN** a pull request changes a file under `web/src` and CI runs
- **THEN** the audit job uploads a report with one screenshot per inventory entry, width, theme and language, and a ranked list of violations, without failing the pull request

#### Scenario: Strict mode on a budget violation
- **WHEN** strict mode is on and a screen renders three rows of chrome above its first task at 1280 px
- **THEN** the audit fails naming the screen, the width and the rule

#### Scenario: Server unreachable on a second visit
- **WHEN** the tour loads the Inbox a second time with the server stopped
- **THEN** the report records the time to the first task row rendered from the local copy, and the screen is captured as it is shown offline

#### Scenario: Story coverage in the report
- **WHEN** a core screen has no story
- **THEN** the report lists it under story coverage, and strict mode fails on it

#### Scenario: Tour on a developer's machine
- **WHEN** a contributor runs the audit command with a Chromium on disk
- **THEN** the report and the contact sheet are written to a directory the command names, and the command exits non-zero only in strict mode

#### Scenario: A sheet slides under reduced motion
- **WHEN** a change gives the phone task sheet a 120 ms slide without a reduced-motion rule and the tour runs
- **THEN** the report lists a movement under reduced motion for the task panel at 360 px naming the sheet and `transform`, and strict mode fails on it

#### Scenario: A drag placeholder moves
- **WHEN** the board's drop placeholder grows its height while a card is dragged under reduced motion
- **THEN** the report lists a movement for the board drag naming the placeholder and `height`

### Requirement: Day page briefing

Today and Upcoming SHALL show a briefing under the title: a bold lead sentence, then at most one more sentence. The briefing SHALL be computed on the device from the local rows: the tasks of projects that are not archived, the in-app notification cache, the close of the day, the calendar grid's day length and the logical today. It SHALL need no network and no model, SHALL work offline, and SHALL follow changes from other devices as they sync and the clock as the day rolls over, like the list under it. Two devices with the same rows and the same day length SHALL show the same briefing. The briefing writes nothing.

On Today with tasks in the list, the briefing SHALL name at most three things that stand out, in this order:
- **Late:**
  - the overdue tasks Today lists, leaving out blocked tasks;
  - one late task is named with how many days late it is, counted from its due date, or from a passed deadline when that is older;
  - more than one is a count;
  - in the danger tone.
- **Load:**
  - when the estimates of Today's tasks (late ones included) exceed the day length, today's planned time against the day length;
  - otherwise, the first of the next seven days whose estimates reach the day length, by weekday;
  - in the warning tone.
- **Replies:**
  - unread notifications of a mention or a reply on a task page;
  - one is named by who answered and about which task, using the device's own copy of the title when the notification carries none;
  - more than one is a count.

The lead SHALL say how many things matter today, and the facts SHALL follow as one sentence. With nothing to name, the briefing SHALL say that nothing stands out, how many tasks are planned and, when there are estimates, the planned time.

When Today's list is empty, the lead SHALL be "All done for today." if the day was closed or a task was completed on the logical today, and otherwise that nothing is planned for today. It SHALL be followed by tomorrow: how many tasks Upcoming lists for tomorrow and the first of them by due time then priority, with its time; or that nothing is planned for tomorrow yet.

On Upcoming the lead SHALL say how many tasks the next seven days hold. When there are any, it SHALL be followed by:
- every one of those days that is already full, or that every day still has room;
- and tomorrow as above.

#### Scenario: Three things
- **WHEN** "Renew the passport" was due two days ago, Monday's estimates fill the eight-hour day, and Mia's unread mention is about "Boiler"
- **THEN** Today's briefing reads "Three things matter today. Renew the passport is 2 days late, Monday is already full, and Mia answered about Boiler."
- **AND** the late part is in the danger tone, the full day in the warning tone, and the titles are shown as written

#### Scenario: A calm day
- **WHEN** Today lists two tasks for today with 45 minutes estimated, nothing is late, no later day is full and no reply is unread
- **THEN** the briefing reads "Nothing stands out today. 2 tasks are planned, about 45m in all."

#### Scenario: Today past the day length
- **WHEN** today's tasks hold nine hours of estimates and the day length is eight hours
- **THEN** the briefing names today's nine hours against the eight-hour day instead of a later full day

#### Scenario: Blocked late task
- **WHEN** the only late task waits for an open blocker
- **THEN** the briefing names nothing late

#### Scenario: All done
- **WHEN** the user completed the last task of Today, and tomorrow holds four tasks, the first "Standup" at 09:30
- **THEN** the briefing reads "All done for today. Tomorrow starts with 4 tasks; the first is Standup at 9:30 AM." in the user's time format

#### Scenario: A clear day
- **WHEN** nothing was due today and nothing was completed today
- **THEN** the briefing starts "Nothing is planned for today." and goes on with tomorrow

#### Scenario: Upcoming
- **WHEN** the next seven days hold six tasks, Friday and Monday are full and tomorrow holds one task, "Groceries"
- **THEN** Upcoming's briefing reads "6 tasks in the next seven days. Friday and Monday are already full. Tomorrow starts with one task; the first is Groceries."

#### Scenario: Offline and after sync
- **WHEN** the device is offline and another device completed the late task earlier
- **THEN** the briefing still names it until the completion syncs, and drops it as soon as it arrives, without a reload

#### Scenario: Reply read
- **WHEN** the user opens the task the unread reply was about
- **THEN** the reply leaves the briefing

### Requirement: Task page
A task opened from a list SHALL remember that list: its address, its name, its tasks in display order and its scroll position. The page SHALL show the task's place in that list as "n / m" with controls for the next and previous task, and `j` and `k` SHALL open the next and previous task in place, so Escape still returns in one step. Escape (outside a text field and outside an overlay), Close and the phone's Back SHALL return to that list with the task selected and the list scrolled where it was. A task opened from outside a list (a reminder, a notification, the command palette) SHALL return to the task's own list (its project, or the Inbox); a task opened from its address alone (a reload, a link) SHALL show no place in a list and SHALL return to the task's own list with the task selected. Addresses of the form `?task=<id>` SHALL keep working and open the task's page over the page in the address.

#### Scenario: Step through a list
- **WHEN** the user opens the second of three tasks in a project and presses `j`
- **THEN** the third task's page shows "3 / 3", the next control is disabled, and a further `j` does nothing

#### Scenario: Back to the same spot
- **WHEN** the user scrolled Upcoming down, opened a task, stepped to the next one with `j` and pressed Escape
- **THEN** Upcoming shows at the same scroll position with the task last shown selected, and the browser's history holds no extra entry

#### Scenario: Opened from a link
- **WHEN** the user opens `/task/<id>` of a task in the Inbox from a bookmark and chooses Close
- **THEN** the Inbox opens with that task selected

#### Scenario: Older link
- **WHEN** the user opens `/upcoming?task=<id>`
- **THEN** the task's page opens, and Escape returns to Upcoming

### Requirement: Task facts column
The task page SHALL show the task's properties in a facts column of labelled rows under the headings Schedule (Do, Start, Deadline, Reminder, Repeat), Details (Priority, Estimate, Assignee when the account can assign, Blocked by, Blocks when something waits for the task, Location), Labels and Project (project, section when the project has sections or the task has one, parent task, origin when it has one). A row with a value SHALL read in the list row's words; a row without one SHALL read as the action that sets it ("Set a deadline", "Add a place", "Doesn’t repeat") in a quiet tone. Activating a row SHALL open the same editor the facet part opens (see "Facet editors are popovers"), anchored to the row, and write the same operation. The list keys that open an editor (`d`, `Shift+N`, `b`, `e`) SHALL open the task page with that row's editor open. For a viewer every row SHALL be text and rows without a value SHALL be hidden.

#### Scenario: Set a deadline from its row
- **WHEN** the user activates "Set a deadline" on a task's page
- **THEN** the When editor opens on its Deadline segment anchored to the row, and a picked date reads in the row afterwards

#### Scenario: Deadline from the list
- **WHEN** a task is selected in Today and the user presses `d`
- **THEN** the task's page opens with the When editor on its Deadline segment and the date field focused

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens one of its tasks
- **THEN** the facts read as text, no row opens an editor, and no unset fact is listed
