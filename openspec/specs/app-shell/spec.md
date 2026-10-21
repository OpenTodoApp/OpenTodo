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
The sidebar SHALL show, top to bottom: the app name with a search button beside it (search and commands), the primary destinations Inbox, Today, Upcoming, Calendar (Day or Week, as last used) pinned at the top; then, in one scroller, a "More" group collapsed by default (Anytime, Someday, Assigned to me, Completed, Updates, Locations, Trash, Filter, Ask when available), the Favourites group when the user has pinned anything, then Projects, Labels and Filters, each collapsible with its state remembered on the device and its item count on the header while collapsed; then one pinned footer row holding the account (avatar and name, opening the account menu), the assistant launcher when the assistant is available, notifications and the sync status. On a device that has not stored a state for a group, Projects SHALL start open and Labels and Filters SHALL start closed. From 768 px with a fine pointer, More SHALL instead be a row after the primary destinations that opens a menu of those destinations, carrying the same marker on the row. The Filters group SHALL be shown only once the user has a saved filter and the Labels group only once the user has a label; an empty group shows nothing, not a placeholder sentence.

Counts SHALL be visible at all times on Inbox, Today and collapsed group headers only. A project's count SHALL be visible while its row is hovered or focused, and at all times on a coarse pointer; favourites follow the rule of their own kind. Filter rows and label rows SHALL show no count. Every row that has a count SHALL carry it in its accessible name. The unread badges of shared projects and of Updates are governed by `activity-feed` and are unchanged.

The primary destinations and the More group SHALL depend on the user's "How you work" preference:

| Preference | Primary destinations | More group |
| --- | --- | --- |
| `lists` and `companion` | Inbox, Today, Upcoming, Calendar (Day or Week, as last used) | Loop home, Next, Waiting, Anytime, Someday, Assigned to me, Completed, Updates, Locations, Trash, Filter, Review, Statistics, Ask when available |
| `first` | Loop home, Inbox, Today, Next, Waiting, Review | Upcoming, Calendar, Anytime, Someday, Assigned to me, Completed, Updates, Locations, Trash, Filter, Statistics, Ask when available |

In `first` mode the primary destinations SHALL never exceed six. Promoted destinations SHALL be listed in the More group, and the stored promotion list SHALL be kept unchanged.

#### Scenario: Default sidebar
- **WHEN** a user with projects, labels, saved filters and no favourites opens the app on a 1280×800 screen on a device that never stored a group state
- **THEN** five primary destinations and the More group are visible above Projects (open), Labels (closed, "Labels 3") and Filters (closed, "Filters 2"), no Favourites group is shown, the footer is one row that is visible without scrolling, and only the middle part scrolls when the project tree is long

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
- **THEN** the drawer's scroller, which holds More and the groups below it, scrolls and reaches the last project, the primary destinations and the footer stay in place, and the page behind the drawer does not move

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
- **THEN** the primary destinations are Loop home, Inbox, Today, Next, Waiting and Review in that order, Upcoming and Calendar are in the More group, and the Review entry carries its rhythm marker as a dot

#### Scenario: Promotions kept across modes
- **WHEN** a user who promoted Someday switches to Open Loops first and later back to Companion
- **THEN** Someday is in the More group while in Open Loops first, and is a primary destination again after switching back, on every device after sync

#### Scenario: Locations in More
- **WHEN** the user opens the More group, in any "How you work" mode
- **THEN** Locations is listed after Updates and before Trash, and it is never a primary destination

### Requirement: Page template
Every view SHALL render a page header with the title in one size, optional meta text beside it, at most two visible actions, an overflow menu for the rest and the Help action; below it a content column whose width is fixed per page type: lists and feeds 48 rem, settings and forms 42 rem, boards, timelines and calendars the whole frame. Every page type SHALL share one page frame: centred in the column, at most 80 rem wide, with the same side padding. The header, and any footer line a page shows below its content, SHALL span the whole frame, so at a given window width the title starts and the last header action ends at the same place on every page; the content SHALL start at the frame's left edge and wide content SHALL scroll inside the frame rather than widen it. Switching a project between list, board and timeline SHALL not move its title or actions. The header SHALL stay visible while the content scrolls.

#### Scenario: Same left edge
- **WHEN** the user moves between Inbox, a project, Labels, Trash and the Filter view on a 1280 px screen
- **THEN** the title and the content start at the same horizontal position in all five, and the header's last action ends at the same position in all five

#### Scenario: Actions in the header
- **WHEN** a project has Share, Rename, Move, Archive, Activity and History actions
- **THEN** the header shows the List/Board control and Share, and the remaining actions are in the overflow menu

#### Scenario: List, board and timeline keep the header still
- **WHEN** the user switches "Q4 launch" from List to Board to Timeline on a 1440 px screen
- **THEN** the project title and the List/Board/Timeline control stay at the same position in all three, and only the content below changes width

#### Scenario: Wide board inside the frame
- **WHEN** a board has eight columns on a 1280 px screen
- **THEN** the board scrolls sideways inside the frame and the header keeps its width and position

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
From 1024 px the panel SHALL be a 26 rem column, 30 rem from 1440 px, and SHALL offer an Expand action that opens the task as a full page at `/task/<id>` with the same content and a Back action. Between 768 and 1023 px it SHALL be a sheet of at most 28 rem over the content column; below 768 px it SHALL open as a full-screen sheet over the list with a sticky header.

#### Scenario: Expand a long note
- **WHEN** the user activates Expand on an open task
- **THEN** the task fills the content column, the address is `/task/<id>`, and Back returns to the list with the panel open

### Requirement: Phone navigation
Below 768 px the shell SHALL show a bottom tab bar with Today, Inbox, Upcoming, Search and More (More opens the sidebar as a drawer), and a floating add button that opens quick add as a bottom sheet with the keyboard up. The bar and the button SHALL hide while a sheet or the task panel is open. Tabs SHALL be at least 44 px tall and SHALL respect the bottom safe area.

#### Scenario: Two taps to any primary view
- **WHEN** the user is in a project on a phone and taps Today in the bar
- **THEN** Today opens without the drawer

#### Scenario: Add from anywhere
- **WHEN** the user taps the floating add button in Upcoming
- **THEN** quick add opens as a bottom sheet with its field focused and the Upcoming default date applied, and the list stays visible above the keyboard

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

The browser tab title SHALL name the current page ("Today – OpenTodo"), following the page heading also when its text arrives later. A navigation the person started SHALL move focus to the new page's heading, except on the first load (including the start-view redirect), while a dialog, an overlay or the task panel holds focus, while a text field has it, and when the new page moved focus into itself. A "Skip to content" link SHALL be the first focusable element of the shell, shown while focused, and SHALL move focus to the page heading. This is presentation only and behaves the same offline.

#### Scenario: Navigating from the sidebar

- **WHEN** the user activates "Today" in the sidebar
- **THEN** the tab title is "Today – OpenTodo" and focus is on the page heading

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
State in the sidebar SHALL be marked with one language: a small dot in the accent colour, with the meaning in the element's tooltip and accessible name, never a filled or coloured badge with text. The rhythm marker on More and on the Review entry SHALL be such a dot. The danger colour SHALL be reserved for errors. Markers are derived from local data, so they are correct offline and follow every sync; nothing is written for them.

#### Scenario: Review due on More
- **WHEN** the last weekly review was finished nine days ago and the user is in Lists only or Companion mode on a desktop
- **THEN** the More row shows a dot after its label and no text badge, hovering or focusing the row reads "Review due · last weekly review 9 days ago", the row's accessible name includes that text, and in the More menu the Review item's description says the same

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
