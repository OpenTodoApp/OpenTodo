# app-shell Specification

## Purpose
Defines the frame every screen of the web app lives in: the fixed three-column layout and its scroll model, the sidebar's structure, the page template, the panel slot and its address, status and notices, and how the frame changes on phones.

## Requirements

### Requirement: Three columns, three scrollers
From 768 px wide the shell SHALL fill the viewport height with the sidebar and the content column side by side, and from 1024 px the open panel SHALL be a third column (a sheet over the content column below that). Each SHALL scroll vertically on its own and the page itself SHALL never scroll. No other element SHALL scroll vertically, except designated regions inside the content column (board columns, the calendar grid). Scrolling one column SHALL not move another.

#### Scenario: Task open on a desktop
- **WHEN** a task is open beside a list longer than the screen on a 1280×800 screen
- **THEN** exactly three vertical scroll regions exist (sidebar, list, panel), scrolling the list leaves the panel header in place, and no blank area appears under the panel

#### Scenario: Automated scroller count
- **WHEN** the layout check opens any screen with its panel open
- **THEN** it fails if more than three elements can scroll vertically, naming the screen and the extra element

### Requirement: Sidebar structure
The sidebar SHALL show, top to bottom: the workspace control (the current workspace's icon or colour and name, opening the workspace switcher; the app name is shown beside it only while the account has one workspace) with a search button beside it (search and commands), the primary destinations Inbox, Today, Upcoming, Calendar (Day or Week, as last used) pinned at the top; then, in one scroller, a "More" group collapsed by default (Anytime, Someday, Assigned to me, Completed, Updates, Locations, Trash, Filter, Ask when available), the Favourites group when the user has pinned anything in the current workspace, then Projects, Labels and Filters, each collapsible with its state remembered on the device and its item count on the header while collapsed; then one pinned footer row holding the account (avatar and name, opening the account menu), the assistant launcher when the assistant is available, notifications and the sync status. Every group, row and count SHALL be those of the current workspace. On a device that has not stored a state for a group, Projects SHALL start open and Labels and Filters SHALL start closed. From 768 px with a fine pointer, More SHALL instead be a row after the primary destinations that opens a menu of those destinations, carrying the same marker on the row. The Filters group SHALL be shown only once the user has a saved filter in the current workspace and the Labels group only once the user has a label there; an empty group shows nothing, not a placeholder sentence.

Counts SHALL be visible at all times on Inbox, Today and collapsed group headers only. A project's count SHALL be visible while its row is hovered or focused, and at all times on a coarse pointer; favourites follow the rule of their own kind. Filter rows and label rows SHALL show no count. Every row that has a count SHALL carry it in its accessible name. The unread badges of shared projects and of Updates are governed by `activity-feed` and are unchanged. The workspace control SHALL carry one accent dot while another workspace has unread updates, with the workspace names in its tooltip and accessible name.

The primary destinations and the More group SHALL depend on the user's "How you work" preference:

| Preference | Primary destinations | More group |
| --- | --- | --- |
| `lists` and `companion` | Inbox, Today, Upcoming, Calendar (Day or Week, as last used) | Loop home, Next, Waiting, Anytime, Someday, Assigned to me, Completed, Updates, Locations, Trash, Filter, Review, Statistics, Ask when available |
| `first` | Loop home, Inbox, Today, Next, Waiting, Review | Upcoming, Calendar, Anytime, Someday, Assigned to me, Completed, Updates, Locations, Trash, Filter, Statistics, Ask when available |

In `first` mode the primary destinations SHALL never exceed six. Promoted destinations SHALL be listed in the More group, and the stored promotion list SHALL be kept unchanged. The workspace control is not a destination and SHALL not count against the six.

#### Scenario: Default sidebar
- **WHEN** a user with projects, labels, saved filters and no favourites opens the app on a 1280×800 screen on a device that never stored a group state
- **THEN** the workspace control, five primary destinations and the More group are visible above Projects (open), Labels (closed, "Labels 3") and Filters (closed, "Filters 2"), no Favourites group is shown, the footer is one row that is visible without scrolling, and only the middle part scrolls when the project tree is long

#### Scenario: One workspace
- **WHEN** an account that never created a workspace opens the app
- **THEN** the control reads "OpenTodo · Personal" and opens the switcher with the one workspace, "New workspace" and "Manage workspaces"

#### Scenario: Groups follow the workspace
- **WHEN** the user switches from "Personal" (4 projects, 2 labels, 1 filter) to "Work" (6 projects, no labels, no filters)
- **THEN** the Projects group lists Work's six projects, no Labels or Filters group is shown, the Favourites group shows Work's pinned items or nothing, and Inbox and Today show Work's counts

#### Scenario: Only two numbers at rest
- **WHEN** the same user has 8 Inbox tasks, 10 due today, projects with open tasks, labels in use and saved filters with matches, and nothing is hovered or focused
- **THEN** the only visible counts in the sidebar are "8" on Inbox and "10" on Today (plus the item counts on the closed Labels and Filters headers), and the Upcoming row shows no number

#### Scenario: Labels are reachable
- **WHEN** the user has forty projects and three labels
- **THEN** scrolling the middle part of the sidebar reaches the Labels group, and nothing inside it scrolls separately

#### Scenario: Promote a destination
- **WHEN** the user turns on "Show in sidebar" for Someday in Settings → Appearance
- **THEN** Someday appears among the primary destinations on every device of that user after sync, and leaves the More group

#### Scenario: Collapse a group
- **WHEN** the user has six saved filters and collapses the Filters group, then reloads the app on the same device
- **THEN** the Filters header reads "Filters 6" with no rows under it, and on the user's other devices the Filters group keeps its own state

#### Scenario: Stored state wins over the default
- **WHEN** the user opened the Labels group on this device before this version, so the device stores it as open, and the app is updated
- **THEN** the Labels group is still open on this device, and a device that never stored a state shows it closed

#### Scenario: Two groups closed
- **WHEN** the user collapses Filters and Labels
- **THEN** the Projects group has the whole height of the scroller, and its "All" and add actions still work on the collapsed groups' headers

#### Scenario: More open on a phone
- **WHEN** a user with 25 projects opens the drawer on a 390×640 phone, opens More and swipes up on the drawer
- **THEN** the drawer's scroller, which holds More and the groups below it, scrolls and reaches the last project, the workspace control, the primary destinations and the footer stay in place, and the page behind the drawer does not move

#### Scenario: More on a desktop
- **WHEN** a user on a 1280×600 screen with a mouse selects More
- **THEN** a menu lists the More destinations below the row, the projects keep their place in the scroller, choosing Someday opens it and closes the menu, and the More row is marked current while Someday is open

#### Scenario: No empty groups
- **WHEN** a new account with no saved filter and no label opens the app
- **THEN** the sidebar shows no Filters or Labels group and no placeholder sentence, and saving a first filter brings the Filters group back, closed, with its All action and "Filters 1" on its header

#### Scenario: Favourites first
- **WHEN** the user has pinned a project, a label and a saved filter
- **THEN** the Favourites group is the first group of the scroller, above Projects, the pinned project's count appears on hover and the pinned label and filter show no count, and the Labels and Filters groups are collapsed on a device that never stored a group state

#### Scenario: Open Loops first sidebar
- **WHEN** a user picks Open Loops first and opens the app on a 1280×800 screen
- **THEN** the primary destinations are Loop home, Inbox, Today, Next, Waiting and Review in that order, Upcoming and Calendar are in the More group, the workspace control sits above them without counting as a seventh, and the Review entry carries its rhythm marker as a dot

#### Scenario: Promotions kept across modes
- **WHEN** a user who promoted Someday switches to Open Loops first and later back to Companion
- **THEN** Someday is in the More group while in Open Loops first, and is a primary destination again after switching back, on every device after sync

#### Scenario: Unread in another workspace
- **WHEN** the user is in "Personal" and a shared project in "Work" receives activity the user has not seen
- **THEN** the workspace control shows one accent dot, its tooltip reads "Updates in Work", and the dot leaves once the user has seen the updates

#### Scenario: Locations in More
- **WHEN** the user opens the More group, in any "How you work" mode
- **THEN** Locations is listed after Updates and before Trash, and it is never a primary destination

#### Scenario: Rules in More
- **WHEN** the user opens the More group, in any "How you work" mode
- **THEN** Rules (OpenSpec `automation-rules`) is listed after Locations and before Trash, and it is never a primary destination

### Requirement: Page template
Every view SHALL render a page header with the title in the page title size, an optional lead line under the title (the page's meta: a date, totals, members and role, a count, a read-only note) in the muted tone at the metadata size, at most two visible actions, an overflow menu for the rest and the Help action; below it a content column whose width is fixed per page type: lists and feeds 60 rem, settings and forms 42 rem, a list with field columns and a project's list layout 72 rem, boards, timelines and calendars the whole frame. The header SHALL be as wide as the content under it: the title SHALL start at the content's left edge and the header's actions SHALL end at the content's right edge, so no action sits beyond the content; on a board, a timeline or a calendar the header spans the frame. The header SHALL stay visible while the content scrolls. Below 768 px the shell's bar SHALL carry the title and show the lead line as its subtitle on one line, cut at the bar's edge, so a lead line that arrives with the data does not grow the bar; on a project the subtitle is plain text, and members and public links open from Share.

There SHALL be two page frames, both with the same side padding and both starting at the content column's left edge, so every page's title starts at the same horizontal position:

- A **standalone page**, one that offers no layout switch (Inbox, Today, Upcoming, Anytime, Someday, Next, Waiting, Assigned to me, Completed, a label, Filter, a saved filter, Trash, Updates, settings, Import, Ask, Help, the review screens), SHALL have a frame as wide as its content width plus the padding, with the header and the content inside it, so the title and the content start at the same left edge.
- A **layout page**, one that offers a layout switch (a project, a saved view that offers a board or a timeline, the calendars), SHALL have one frame shared by every layout, 72 rem for a project and at most 80 rem otherwise: the header and any footer line span the frame, the content starts at the frame's left edge, wide content scrolls inside the frame rather than widening it, and switching a project between list, board and timeline SHALL not move its title or actions.

When the panel opens as a column, the content column SHALL narrow by the panel's width and the panel SHALL open into the space to the right of the frame: no frame SHALL move horizontally when the panel opens or closes, and a frame wider than the narrowed column SHALL narrow from its right side, its left edge staying where it was. Nothing SHALL slide. This is presentation only, reads nothing from the server and behaves the same offline.

#### Scenario: Same left edge
- **WHEN** the user moves between Inbox, Today, Labels, Trash, the Filter view and a project on a 1280 px screen
- **THEN** the title and the first row start at the same horizontal position in all six, at the content column's left edge plus the page padding

#### Scenario: A lead line under the title
- **WHEN** Today is opened on a 1280 px screen with 5 h 15 m planned and 40 m tracked
- **THEN** the title "Today" is on its own line and "Wednesday 21 October · 5 h 15 m planned · 40 m tracked" is a muted line under it, and the two header actions and Help are on the title's line

#### Scenario: Centred on a wide screen
- **WHEN** Today is open with the panel closed on a 2560 px screen with the sidebar at its default width
- **THEN** the frame is no longer centred: it is 60 rem plus its padding wide and starts at the content column's left edge, at the same position as a project's title, and the space to its right is left for the panel

#### Scenario: The panel docks
- **WHEN** Today is open on a 1920 px screen and the user opens a task
- **THEN** the panel is a 30 rem column at the right, the title and every row keep their horizontal position within 1 px, and the list keeps its 60 rem width

#### Scenario: No room to move
- **WHEN** Today is open on a 1024 px screen and the user opens a task
- **THEN** the frame narrows with the column from its right side and the title does not move horizontally

#### Scenario: Opening and closing a task moves no row
- **WHEN** the user opens a task and closes it again on Today and on a project, at 1280, 1440 and 1920 px
- **THEN** the first row and the title are at the same horizontal position, within 1 px, before, while and after the panel is open

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and a task is opened on a 1920 px screen
- **THEN** the list does not move at all, and the panel appears without sliding in

#### Scenario: List, board and timeline keep the header still
- **WHEN** the user switches "Q4 launch" from List to Board to Timeline on a 1440 px screen
- **THEN** the project title and the List/Board/Timeline control stay at the same position in all three, and only the content below changes width

#### Scenario: A project list fills its frame
- **WHEN** a project is shown as a list on a 1440 px screen with the panel closed
- **THEN** its rows span the 72 rem content width from the frame's left edge, the title starts at the same place as on the board, and the header's actions end at the rows' right edge

#### Scenario: Wide board inside the frame
- **WHEN** a board has eight columns on a 1280 px screen
- **THEN** the board scrolls sideways inside the frame and the header keeps its width and position

#### Scenario: Actions in the header
- **WHEN** a project has Share, Rename, Move, Archive, Activity and History actions
- **THEN** the header shows the List/Board control and Share, and the remaining actions are in the overflow menu

#### Scenario: Phone bar carries the lead line
- **WHEN** Today is open on a 390 px screen
- **THEN** the shell's bar shows "Today" with the date line under it as its subtitle, and the page header row shows no second title

#### Scenario: Long lead line on a phone
- **WHEN** a shared project with a public link opens at 360 px and "2 · owner · Public" is wider than the space beside the title
- **THEN** the subtitle stays one line, cut at the bar's edge with its full text reachable, and the bar keeps its height

#### Scenario: Header as wide as its list
- **WHEN** the Inbox is open on a 1920 px screen with the panel closed
- **THEN** the list is 60 rem wide from the frame's left edge, and the header's last action ends at the list's right edge within 2 px

#### Scenario: One project frame for every layout
- **WHEN** a project with three sections is switched from List to Board on a 1920 px screen
- **THEN** the frame stays 72 rem wide, the List/Board/Timeline control does not move, and the board and the list end at the same right edge as the header's actions

### Requirement: No desktop top bar
From 768 px wide the shell SHALL have no bar above the content column; search SHALL be a button beside the app name in the sidebar, notifications, sync status and help SHALL live in the sidebar footer, and page actions in the page header. Below 768 px a bar SHALL show the menu button, the page title and up to two page actions, with the remaining actions in an overflow menu.

#### Scenario: Desktop height for content
- **WHEN** the Inbox is open on a 1280×800 screen
- **THEN** the first task is visible within the top 160 px of the content column

#### Scenario: Phone bar
- **WHEN** a project is open on a 390 px screen
- **THEN** the bar shows the menu button, the project name and the List/Board control, and Share is in the overflow menu

### Requirement: Sync status is quiet
Sync status SHALL be a dot in the sidebar footer, green when synced, animated while syncing, grey when offline and red on error, with the text ("Synced", "3 pending", "Offline") in its tooltip and announced to assistive technology. The text SHALL be visible beside the dot only while offline, on error, or while changes are pending.

#### Scenario: Synced
- **WHEN** the device is online, live and has no pending changes
- **THEN** only the dot is shown, and hovering or focusing it reads "Synced · live updates connected"

#### Scenario: Pending offline
- **WHEN** the device is offline with two unsynced changes
- **THEN** the footer reads "Offline · 2 pending" beside the grey dot

### Requirement: Notices are toasts
Shell notices (a removed start view, a change the server refused, a reminder, an undo offer) SHALL appear as toasts in one stack in the bottom corner, SHALL not push content, SHALL be dismissable, and SHALL be announced to assistive technology. A toast that offers an action SHALL stay until acted on or dismissed; an informational toast SHALL leave after eight seconds.

#### Scenario: Refused change
- **WHEN** the server refuses a change after a role change
- **THEN** a toast explains it with a Dismiss action, and the list does not move

### Requirement: The panel slot has an address
The shell SHALL own one panel slot to the right of the content. The open task's id SHALL be in the address (`?task=<id>`), so reloading, sharing the link or a notification reopens the same task in the same view. The slot SHALL also host project activity, project history and the calendar's planning list, one at a time. Escape or Close SHALL empty the slot and return focus to the row or control that opened it.

#### Scenario: Reload with a task open
- **WHEN** the user has a task open in the Upcoming view and reloads
- **THEN** Upcoming opens with the same task open in the panel

#### Scenario: One occupant
- **WHEN** project activity is shown in the slot and the user opens a task
- **THEN** the task replaces the activity in the slot, and Close returns to the list, not to the activity

### Requirement: Panel width and expansion
From 1024 px the panel SHALL be a 26 rem column, 30 rem from 1440 px, and SHALL offer an Expand action that opens the task as a full page at `/task/<id>` with the same content and a Back action. Between 768 and 1023 px it SHALL be a sheet of at most 28 rem over the content column; below 768 px it SHALL open as a bottom sheet over the dimmed list, at most 90 percent of the viewport height, with a drag handle above its sticky header (see `web-app` "Task detail panel").

#### Scenario: Expand a long note
- **WHEN** the user activates Expand on an open task
- **THEN** the task fills the content column, the address is `/task/<id>`, and Back returns to the list with the panel open

#### Scenario: The list stays in sight on a phone
- **WHEN** the user opens a task from Today on a 390×844 phone
- **THEN** the task opens as a bottom sheet with a drag handle, the top of Today stays visible and dimmed above it, and the sheet is no taller than 90 percent of the screen

### Requirement: Phone navigation
Below 768 px the shell SHALL show a bottom tab bar with Today, Inbox, Upcoming, Search and More (More opens the phone drawer, see "Phone drawer"), and a floating add button at the bottom right above the bar that opens quick add as a bottom sheet with the keyboard up. The bar and the button SHALL hide while a sheet or the task sheet is open. Tabs SHALL be at least 48 px tall and SHALL respect the bottom safe area. Every list SHALL reserve the add button's footprint under its last row, so the button never covers a row or its metadata. While the content scrolls down by more than 24 px the bar SHALL minimise to its icons and the button SHALL slide out below it; on any scroll up, at the end of the content, or 600 ms after scrolling stops, both SHALL return. When the system requests reduced motion the bar and the button SHALL stay in place at all times. This is presentation only; every action behind the bar and the button is the same local operation offline.

#### Scenario: Two taps to any primary view
- **WHEN** the user is in a project on a phone and taps Today in the bar
- **THEN** Today opens without the drawer

#### Scenario: Add from anywhere
- **WHEN** the user taps the floating add button in Upcoming
- **THEN** quick add opens as a bottom sheet with its field focused and the Upcoming default date applied, and the list stays visible above the keyboard

#### Scenario: The last row is readable
- **WHEN** a list of twenty tasks is scrolled to its end on a 390×844 phone
- **THEN** the last row's title and metadata are fully visible above the add button and the tab bar, and nothing is under the button

#### Scenario: The bar minimises while reading
- **WHEN** the user scrolls a long list down by 100 px on a phone without reduced motion
- **THEN** the tab bar shows only its icons at a smaller height and the add button is off screen, and a scroll up of any distance brings both back at full size

#### Scenario: Reduced motion keeps the bar
- **WHEN** reduced motion is requested and the user scrolls a long list down
- **THEN** the tab bar and the add button do not move

### Requirement: Resizable sidebar
From 1024 px the sidebar SHALL be resizable by dragging its edge between 15 rem and 22.5 rem, remembered per device, and SHALL be collapsible to icons with a control in its footer and the shortcut `[`.

#### Scenario: Collapse to icons
- **WHEN** the user presses `[` outside a text field on a desktop
- **THEN** the sidebar shows only icons with their names as tooltips, and the content column widens

### Requirement: Sticky sidebar group headers
While a group's rows scroll inside the sidebar's scroller, the group's header SHALL stay visible at the top of the scroller until the next group's header replaces it. The header SHALL keep its actions (collapse, All, add) while stuck.

#### Scenario: Scrolled into a long tree
- **WHEN** the user scrolls the sidebar so that the twentieth of thirty projects is at the top of the scroller
- **THEN** the "Projects" header is visible above that row and its collapse control still collapses the group

#### Scenario: Next header takes over
- **WHEN** the user scrolls on until the Labels rows reach the top
- **THEN** the "Labels" header is visible at the top and the "Projects" header is not

### Requirement: Find in the sidebar
The sidebar SHALL offer a find field at the top of its scroller, opened from the Projects header, by a registered shortcut and by a palette command. While it has text, the scroller SHALL show only the projects (with their ancestors), labels and filters whose names match it, case- and accent-insensitive, under the headers of the groups that have matches. Escape or clearing the field SHALL restore the groups as they were, collapse state included.

#### Scenario: Narrow to a sub-project
- **WHEN** the user has "Work › Hiring › Designer" and types "des" into the find field
- **THEN** the Projects group shows "Work", "Hiring" and "Designer" in tree order and no other project, the Labels group shows no rows unless a label matches, and Enter on the first match opens it

#### Scenario: Matches across groups
- **WHEN** the user types "wait" and has a label "waiting" and a pinned filter "Waiting for"
- **THEN** both are listed under their own group headers and groups without matches are hidden

#### Scenario: Clear restores the groups
- **WHEN** the Labels group was collapsed before the user typed "err", and the user presses Escape
- **THEN** the field clears, the Labels group is collapsed again and focus is on the field's opener

#### Scenario: In the phone drawer
- **WHEN** the sidebar is open as a drawer on a 390 px wide screen and the user opens the find field
- **THEN** the field is at the top of the drawer's scroller and choosing a match closes the drawer and opens the destination

### Requirement: Page changes are announced

The browser tab title SHALL name the current page and the instance ("Today – OpenTodo", or "Today – Acme Tasks" when the owner named the instance, see `instance-branding`), following the page heading also when its text arrives later. A navigation the person started SHALL move focus to the new page's heading, except on the first load (including the start-view redirect), while a dialog, an overlay or the task panel holds focus, while a text field has it, and when the new page moved focus into itself. A "Skip to content" link SHALL be the first focusable element of the shell, shown while focused, and SHALL move focus to the page heading. This is presentation only and behaves the same offline.

#### Scenario: Navigating from the sidebar

- **WHEN** the user activates "Today" in the sidebar
- **THEN** the tab title is "Today – OpenTodo" and focus is on the page heading

#### Scenario: Branded instance

- **WHEN** the user activates "Today" on an instance the owner named "Acme Tasks"
- **THEN** the tab title is "Today – Acme Tasks"

#### Scenario: First load

- **WHEN** the app opens at its start view
- **THEN** focus is not moved

#### Scenario: A dialog holds focus

- **WHEN** a navigation happens while focus is in a dialog
- **THEN** focus stays in the dialog

#### Scenario: Skip link

- **WHEN** the user presses Tab on a fresh page and activates the first link
- **THEN** focus moves to the page heading

### Requirement: Compact sidebar on a desktop
From 768 px the sidebar footer SHALL be one row: the account control (the person's avatar and name, truncated when the row is narrow) that opens the account menu, then, as icon buttons each with its name as tooltip and accessible name, the assistant launcher when the assistant is available, notifications, the sync dot and, from 1024 px, the collapse control. The account menu SHALL offer Settings, Help and Keyboard shortcuts, each with its registered shortcut shown, and after a separator Sign out, which opens the same confirmation as Settings → Account. Below 768 px the footer SHALL be the same row with touch-height targets. With a fine pointer, sidebar rows SHALL be 32 px high and group headings tighter; with a coarse pointer rows keep their touch height. The sidebar's scroller SHALL have a thin scrollbar in the theme's border colour, stronger while the pointer or focus is inside it, and SHALL fade its top or bottom edge only while content is hidden past that edge, leaving the scrollbar itself unfaded.

#### Scenario: Short desktop window
- **WHEN** a user with twelve projects opens the app in a 1280×600 window with a mouse
- **THEN** at least eight projects are visible in the sidebar without scrolling, the footer takes one row, and the bottom edge of the scroller fades while projects are hidden below it

#### Scenario: Footer names
- **WHEN** a screen reader user moves through the footer row on a desktop
- **THEN** each control announces its name (the person's name as the account menu button, Notifications with its unread count, the sync status, Collapse sidebar), and the account menu's items announce Settings, Help, Keyboard shortcuts and Sign out with their shortcuts as descriptions

#### Scenario: Help from the account menu
- **WHEN** the user opens the account menu and chooses Help, then later presses `g` then `?` from the Inbox
- **THEN** the Help page opens both times, the account control is marked current while Help, Settings or Import is open, and the page header's Help action and the command palette's "Open Help" still open it too

#### Scenario: Sign out from the sidebar
- **WHEN** the user chooses Sign out in the account menu
- **THEN** the "Sign out of this device?" confirmation opens with focus on Cancel, Escape returns focus to the account control, and confirming proceeds exactly as from Settings → Account

#### Scenario: Narrow sidebar
- **WHEN** the sidebar is at its minimum width of 15 rem and the account name is "Alexandra Konstantinopoulou"
- **THEN** the name truncates with an ellipsis, every icon button of the row stays visible and at least 32 × 32 px, and nothing wraps to a second row

#### Scenario: Touch keeps its targets
- **WHEN** the sidebar is shown on a 768 px touch screen
- **THEN** More is the inline group, rows keep their touch height, project counts are visible without hovering, the footer is one row, and every control in the sidebar is at least 44 × 44 px

### Requirement: Quiet markers in the sidebar
State in the sidebar SHALL be marked with one language: a small dot in the accent colour, with the meaning in the element's tooltip and accessible name, never a filled or coloured badge with text. The rhythm marker on the Review entry SHALL be such a dot. The danger colour SHALL be reserved for errors. Markers are derived from local data, so they are correct offline and follow every sync; nothing is written for them.

#### Scenario: More on a desktop
- **WHEN** a user with a mouse on a 1280 px screen has a weekly review nine days overdue in Companion mode
- **THEN** the More row shows "MORE" with a chevron and no dot, opening it lists the destinations with a dot on Review whose accessible description reads "Review due · last weekly review 9 days ago", and the Updates item carries its unread badge

#### Scenario: Count on hover
- **WHEN** the user moves the pointer over "Website launch" (5 open tasks) in the Projects group
- **THEN** "5" appears at the row's right edge without the row growing, it disappears when the pointer leaves, Tab onto the row shows it again, and a screen reader reads the row as "Website launch, 5 open tasks" whether or not it is hovered

#### Scenario: Error marks stay
- **WHEN** a saved filter's query no longer parses and sync fails
- **THEN** the filter row keeps its error mark with the message in its accessible name, and the sync dot turns to the danger colour with "Sync error" beside it

### Requirement: Notification bell marker
The notification bell in the sidebar footer SHALL show a dot in the accent colour for one unread notification, a small count in the accent colour above one, and nothing with none; its accessible name SHALL state the number ("Notifications, 2 unread"). The mark is read from the local notification cache, so it is correct offline and changes with every sync; nothing is written for it.

#### Scenario: One notification
- **WHEN** one unread notification arrives on sync
- **THEN** the bell shows a dot in the accent colour and no number, and its accessible name is "Notifications, 1 unread"

#### Scenario: Several notifications
- **WHEN** a third unread notification arrives
- **THEN** the bell shows "3" in a small accent count, never in red, and reading the first one from the list changes it to "2"

### Requirement: Favourites group
The Favourites group SHALL list the user's pinned projects, labels and saved filters in the user's order, each with the icon or colour and the live open-task count its own group shows, opening the same destination. Items SHALL be reorderable from their menus and by keyboard, and unpinnable from their menus. The group SHALL reflect pins, order and renames from the user's other devices after sync, and SHALL render from local data so it is correct offline.

#### Scenario: Mixed kinds in order
- **WHEN** the user pins "Website launch" (project, 5 open), "Deep work" (filter, 4 matches) and "errand" (label, 3 open) and moves "Deep work" to the top
- **THEN** the group reads "Deep work 4", "Website launch 5", "errand 3" on this device now and on other devices after sync, and each row opens its view

#### Scenario: Pinned item removed
- **WHEN** a pinned project is archived or deleted on another device and this device syncs
- **THEN** it leaves the Favourites group without a reload and reappears if it is restored

#### Scenario: Pinned offline
- **WHEN** the device is offline and the user pins a label
- **THEN** it appears in Favourites at once, survives a reload, and reaches the user's other devices when the network returns

### Requirement: Sidebar header row
The top of the sidebar SHALL be one header row holding the instance's mark and name on the left (the brand mark and the wordmark "OpenTodo", or the owner's logo and name on a branded instance, see `instance-branding`) and the search and commands button on the right. The header row SHALL be a slot whose left part can be replaced by another control (the workspace control of `workspaces`) while the search button and everything below the row stay unchanged. On the icon rail the row SHALL show the mark alone, centred, with the instance's name as its tooltip and accessible name. The brand mark SHALL be the mono variant, so it follows the sidebar's text tone in both themes, and the wordmark SHALL be set in the interface typeface at the body size with the strong text tone. The header row SHALL be rendered from local data only and SHALL look the same offline.

#### Scenario: Header at rest
- **WHEN** a user opens the app on a 1280×800 screen in light and in dark
- **THEN** the sidebar starts with the brand mark at 24 px, the wordmark "OpenTodo" and the search button in one row of 40 px or less, the mark is drawn in the current text tone with the accent on its loop, and no tick-in-a-square image is anywhere in the sidebar

#### Scenario: Icon rail
- **WHEN** the user collapses the sidebar with `[`
- **THEN** the header row shows the mark alone at 24 px, hovering or focusing it reads "OpenTodo", and the search button moves to the footer as before

#### Scenario: Branded header
- **WHEN** the owner set a logo and the name "Acme Tasks"
- **THEN** the header row shows the logo at 24 px and "Acme Tasks" in place of the mark and the wordmark, and the rail's tooltip reads "Acme Tasks"

#### Scenario: Replaceable left part
- **WHEN** a later change renders another control in the header's left part
- **THEN** the search button keeps its place and shortcut, the primary destinations start at the same vertical position, and the sidebar's tests for the destinations, groups and footer pass unchanged

### Requirement: Sidebar tones
Sidebar rows SHALL use three tones. An inactive row and its icon SHALL use the quiet text tone (the step below `muted` in the tone scale); while hovered or focused the row SHALL raise its label and icon to the default text tone over the sunken surface; the active row SHALL be an accent-soft pill with the strong text tone and the icon in the accent colour. Group headers SHALL use the quiet tone at the hint size, uppercase. Counts SHALL use the quiet tone and tabular figures. Every tone on every sidebar surface SHALL meet 4.5:1 for text and 3:1 for icons, measured by the token contrast test in both themes, with and without the sidebar tint. The tones are tokens, so a theme or accent change switches them without a reload.

#### Scenario: Three tones in one list
- **WHEN** Today is open and the pointer rests on Upcoming
- **THEN** Today is an accent-soft pill with strong text and an accent icon, Upcoming shows default-tone text and icon on the sunken surface, and every other row shows quiet-tone text and icons

#### Scenario: Contrast on the tinted sidebar
- **WHEN** the token contrast test runs
- **THEN** it measures the quiet, default and strong text tones and the accent icon against the sidebar surface token in light, dark and high contrast, and fails naming the pair when one is under its minimum

#### Scenario: Keyboard shows the raised tone
- **WHEN** a keyboard user presses Tab onto a project row
- **THEN** the row shows the default tone and the focus ring, exactly as on hover, and its hover count is visible

### Requirement: Group header controls
A sidebar group header SHALL show its label at the hint size in uppercase with its chevron when collapsible, and SHALL keep its controls (All, find, add, and the project tree menu) in the document at all times. With a fine pointer the controls SHALL be invisible until the pointer or keyboard focus is inside the group's header or rows, and SHALL become visible without the header changing height or the label moving; they SHALL remain focusable by Tab while invisible and SHALL become visible the moment one receives focus. With a coarse pointer the controls SHALL be visible at all times. The group's item count SHALL be part of the header's accessible name whether the group is open or closed, and SHALL be shown visibly only while the group is closed, as today.

#### Scenario: Controls appear on hover
- **WHEN** a mouse user moves the pointer over the Projects header
- **THEN** All, find and add appear at the header's right edge, the header is the same height as before, the label has not moved, and the controls disappear when the pointer leaves the group

#### Scenario: Controls reachable by keyboard
- **WHEN** a keyboard user presses Tab from the Projects label
- **THEN** focus lands on All, which becomes visible with the focus ring, and Tab again moves to find and then add

#### Scenario: Touch keeps the controls
- **WHEN** the sidebar is shown on a 768 px touch screen
- **THEN** every group's controls are visible at rest and at least 44 × 44 px

#### Scenario: Count in the name
- **WHEN** a screen reader reads the open Projects header with twelve projects
- **THEN** it announces "Projects, 12 items" with no count drawn, and after the group is collapsed the header shows "12" and announces the same

### Requirement: Running entry pill in the footer
While the user has a running time entry on a screen 768 px or wider, the sidebar footer SHALL stay one row: a pill in the accent-soft tint SHALL take the place of the account name beside the avatar, holding a timer icon, the elapsed time in tabular figures (`h:mm` from one hour, ticking every minute), the task's title truncated, and a Stop control inside the pill. Activating the pill SHALL open the task; activating Stop SHALL end the entry without opening the task. The avatar SHALL stay and the account menu SHALL still open from it with the person's name as the menu's name. On the icon rail the pill SHALL show the elapsed time alone, with the title and Stop in its tooltip and menu. When no entry runs the account name SHALL be shown as before. The pill SHALL be announced once when tracking starts and once when it stops, never per tick. The elapsed time is computed from the local entry, so it is right offline and follows a stop made on another device after sync.

#### Scenario: Pill replaces the name
- **WHEN** an entry on "Write the report" has run for 1 hour and 5 minutes on a 1280 px screen
- **THEN** the footer is one row reading avatar, "1:05 · Write the report" in a pill with a Stop control, then the assistant, bell, sync dot and collapse control, and no second line exists above or below it

#### Scenario: Stop from the pill
- **WHEN** the user activates Stop inside the pill
- **THEN** the entry ends with the local time, the pill is replaced by the account name without the row moving, "Tracking stopped" is announced once, and the task panel does not open

#### Scenario: Account menu while tracking
- **WHEN** the user activates the avatar while the pill is shown
- **THEN** the account menu opens with the person's name as its name and Settings, Help, Keyboard shortcuts and Sign out as before

#### Scenario: Stopped elsewhere
- **WHEN** the entry is stopped on another device and this device syncs
- **THEN** the pill disappears and the account name returns without a reload

### Requirement: More is a labelled group
The More entry SHALL read as a group, not a destination: on a desktop with a fine pointer it SHALL be a row styled as a group header (the label "More" at the hint size in uppercase with a chevron, no icon) that opens the menu of the More destinations, as the archived "Sidebar structure" requires; on a phone and on a coarse pointer it SHALL be the inline collapsible group with the same header style. The More header SHALL carry no state marker and no count; the unread badge of Updates SHALL be shown on the Updates item inside More and, while More is a menu, nowhere on the header. The review-due marker SHALL be shown on the Review entry wherever that entry is: as a primary destination in Open Loops first, or as an item inside More in Lists only and Companion. The More row SHALL be marked current while one of its destinations is open.

#### Scenario: More on a desktop
- **WHEN** a user with a mouse on a 1280 px screen has a weekly review nine days overdue in Companion mode
- **THEN** the More row shows "MORE" with a chevron and no dot, opening it lists the destinations with a dot on Review whose accessible description reads "Review due · last weekly review 9 days ago", and the Updates item carries its unread badge

#### Scenario: More on a phone
- **WHEN** the same user opens the drawer on a 390 px phone
- **THEN** More is an inline group with the same header style and no marker, and expanding it shows the Review item with its dot

#### Scenario: Current while inside
- **WHEN** the user opens Someday from the More menu
- **THEN** the More row is marked current and keeps its group style, and choosing Today removes the mark

### Requirement: Sidebar surface tint
From 768 px with a fine pointer the sidebar's background SHALL be the sidebar surface token: the canvas mixed with a trace of the accent (3 % in light, 4 % in dark, both in the oklab colour space), so the sidebar reads as one quiet surface a step apart from the content column. The sticky group headers SHALL use the same token so scrolling never shows a seam. The sidebar SHALL never be translucent over content, and the high-contrast override SHALL set the sidebar surface to the plain canvas. The phone drawer and the sheets SHALL keep their surface colour. The tint SHALL follow the accent theme and the colour scheme without a reload.

#### Scenario: Tint follows the theme
- **WHEN** the user switches the accent theme from emerald to blue and the colour scheme from light to dark
- **THEN** the sidebar surface becomes the dark canvas mixed with 4 % of the blue accent, the sticky headers match it, and the content column keeps the plain canvas

#### Scenario: No seam while scrolling
- **WHEN** the user scrolls a sidebar with forty projects
- **THEN** the sticky Projects header shows the sidebar surface colour, and no band of a different colour appears above the rows

#### Scenario: High contrast
- **WHEN** the high-contrast override is on
- **THEN** the sidebar surface is pure white in light and pure black in dark, with no accent mixed in

#### Scenario: Phone keeps the surface
- **WHEN** the drawer opens on a 390 px phone
- **THEN** its background is the surface colour of sheets, with no accent tint

### Requirement: Phone drawer
Below 768 px, More SHALL open a drawer from the left edge, at most 85 percent of the viewport width and at most 20 rem, over a scrim that closes it on tap. The drawer SHALL NOT repeat the tab bar's destinations. It SHALL show, top to bottom, in one scroller: the find field, the primary destinations the tab bar does not hold (Calendar in Lists and Companion; Loop home, Next, Waiting and Review in Open Loops first), the More group, then Favourites, Projects, Labels and Filters as rows at least 48 px tall following the sidebar's counts and grouping rules; then a pinned footer with the account row (opening Settings, Help, Keyboard shortcuts and Sign out), the assistant launcher when the assistant is available, notifications and the sync status. Choosing a destination SHALL close the drawer. The drawer SHALL use the sidebar's tones. The page behind the drawer SHALL NOT scroll while it is open.

#### Scenario: No repeated destinations
- **WHEN** a user in Companion mode opens the drawer on a 390 px phone
- **THEN** Calendar is the first destination, Today, Inbox and Upcoming are not listed, and the More group follows

#### Scenario: Open Loops first on a phone
- **WHEN** a user in Open Loops first mode opens the drawer
- **THEN** Loop home, Next, Waiting and Review are listed above the More group, and Today, Inbox and Upcoming are not, since the tab bar holds them

#### Scenario: Forty projects
- **WHEN** a user with forty projects opens the drawer and swipes up
- **THEN** the scroller reaches the last project and the Labels and Filters groups, the footer stays in place, and the page behind does not move

#### Scenario: Settings from the drawer
- **WHEN** the user taps the account row in the drawer's footer and chooses Settings
- **THEN** Settings opens and the drawer is closed
