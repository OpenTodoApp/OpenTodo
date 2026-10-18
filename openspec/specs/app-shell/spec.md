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
The sidebar SHALL show, top to bottom:
1. the app name
2. the primary destinations, pinned at the top
3. in one scroller, a "More" group collapsed by default, then the Filters, Projects and Labels groups, each collapsible with its state remembered on the device and its item count on the header while collapsed
4. a pinned footer with Help, search, notifications, sync status and the account

Counts SHALL appear on Inbox, Today, projects and collapsed group headers only.

The primary destinations and the More group SHALL depend on the user's "How you work" preference:

| Preference | Primary destinations | More group |
| --- | --- | --- |
| `lists` and `companion` | Inbox, Today, Upcoming, Calendar (Day or Week, as last used) | Loop home, Next, Waiting, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Review, Statistics, Ask when available |
| `first` | Loop home, Inbox, Today, Next, Waiting, Review | Upcoming, Calendar, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Statistics, Ask when available |

In `first` mode the primary destinations SHALL never exceed six. Promoted destinations SHALL be listed in the More group, and the stored promotion list SHALL be kept unchanged.

#### Scenario: Default sidebar
- **WHEN** a user in `lists` mode with projects and labels opens the app on a 1280×800 screen
- **THEN** four primary destinations and the More group are visible above Filters, Projects and Labels, the footer is visible without scrolling, and only the middle part scrolls when the project tree is long

#### Scenario: Open Loops first sidebar
- **WHEN** a user picks Open Loops first and opens the app on a 1280×800 screen
- **THEN** the primary destinations are Loop home, Inbox, Today, Next, Waiting and Review in that order, Upcoming and Calendar are in the More group, and the Review entry carries its rhythm markers

#### Scenario: Promotions kept across modes
- **WHEN** a user who promoted Someday switches to Open Loops first and later back to Companion
- **THEN** Someday is in the More group while in Open Loops first, and is a primary destination again after switching back, on every device after sync

#### Scenario: Labels are reachable
- **WHEN** the user has forty projects and three labels
- **THEN** scrolling the middle part of the sidebar reaches the Labels group, and nothing inside it scrolls separately

#### Scenario: Promote a destination
- **WHEN** a user in `lists` mode turns on "Show in sidebar" for Someday in Settings → Appearance
- **THEN** Someday appears among the primary destinations on every device of that user after sync, and leaves the More group

#### Scenario: Collapse a group
- **WHEN** the user has six pinned filters and collapses the Filters group, then reloads the app on the same device
- **THEN** the Filters header reads "Filters 6" with no rows under it, the Projects group starts directly below it, and on the user's other devices the Filters group is still open

#### Scenario: Two groups closed
- **WHEN** the user collapses Filters and Labels
- **THEN** the Projects group has the whole height of the scroller, and its "All" and add actions still work on the collapsed groups' headers

#### Scenario: More open on a phone
- **WHEN** a user with 25 projects opens the drawer on a 390×640 phone, opens More and swipes up on the drawer
- **THEN** the drawer's scroller, which holds More and the groups below it, scrolls and reaches the last project, the primary destinations and the footer stay in place, and the page behind the drawer does not move

### Requirement: Page template
Every view SHALL render a page header with the title in one size, optional meta text beside it, at most two visible actions, an overflow menu for the rest and the Help action; below it a content column whose width is fixed per page type: lists and feeds 48 rem, settings and forms 42 rem, boards and calendars the full column. The header SHALL stay visible while the content scrolls.

#### Scenario: Same left edge
- **WHEN** the user moves between Inbox, a project, Labels, Trash and the Filter view on a 1280 px screen
- **THEN** the title and the content start at the same horizontal position in all five

#### Scenario: Actions in the header
- **WHEN** a project has Share, Rename, Move, Archive, Activity and History actions
- **THEN** the header shows the List/Board control and Share, and the remaining actions are in the overflow menu

### Requirement: No desktop top bar
From 768 px wide the shell SHALL have no bar above the content column; search, notifications, sync status and help SHALL live in the sidebar footer and the page header. Below 768 px a bar SHALL show the menu button, the page title and up to two page actions, with the remaining actions in an overflow menu.

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
