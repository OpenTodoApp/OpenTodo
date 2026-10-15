# Spec Delta

## Purpose

Defines the frame every screen of the web app lives in: the fixed three-column layout and its scroll model, the sidebar's structure, the page template, the panel slot and its address, status and notices, and how the frame changes on phones.

## ADDED Requirements

### Requirement: Three columns, three scrollers
From 768 px wide the shell SHALL fill the viewport height with the sidebar and the content column side by side, and from 1024 px the open panel SHALL be a third column (a sheet over the content column below that). Each SHALL scroll vertically on its own and the page itself SHALL never scroll. No other element SHALL scroll vertically, except designated regions inside the content column (board columns, the calendar grid). Scrolling one column SHALL not move another.

#### Scenario: Task open on a desktop
- **WHEN** a task is open beside a list longer than the screen on a 1280×800 screen
- **THEN** exactly three vertical scroll regions exist (sidebar, list, panel), scrolling the list leaves the panel header in place, and no blank area appears under the panel

#### Scenario: Automated scroller count
- **WHEN** the layout check opens any screen with its panel open
- **THEN** it fails if more than three elements can scroll vertically, naming the screen and the extra element

### Requirement: Sidebar structure
The sidebar SHALL show, top to bottom: the app name, the primary destinations Inbox, Today, Upcoming, Calendar (Day or Week, as last used) and a "More" group collapsed by default (Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Ask when available); then the Filters, Projects and Labels groups in one scroller; then a pinned footer with Help, search, notifications, sync status and the account. Counts SHALL appear on Inbox, Today and projects only.

#### Scenario: Default sidebar
- **WHEN** a user with projects and labels opens the app on a 1280×800 screen
- **THEN** five primary destinations and the More group are visible above Filters, Projects and Labels, the footer is visible without scrolling, and only the middle part scrolls when the project tree is long

#### Scenario: Labels are reachable
- **WHEN** the user has forty projects and three labels
- **THEN** scrolling the middle part of the sidebar reaches the Labels group, and nothing inside it scrolls separately

#### Scenario: Promote a destination
- **WHEN** the user turns on "Show in sidebar" for Someday in Settings → Appearance
- **THEN** Someday appears among the primary destinations on every device of that user after sync, and leaves the More group

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
