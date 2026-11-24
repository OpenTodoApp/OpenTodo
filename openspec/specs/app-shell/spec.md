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
The sidebar SHALL show, top to bottom: the workspace control (the current workspace's picture and name, opening the workspace switcher, see "Workspace picture") with a search button beside it (search and commands), the primary destinations Inbox, Today, Upcoming, Calendar (Day or Week, as last used) pinned at the top; then, in one scroller, a "More" group collapsed by default (Anytime, Someday, Assigned to me, Completed, Updates, Locations, Trash, New view, Ask when available), the Favourites group when the user has pinned anything in the current workspace, then Projects, Labels and Views, each collapsible with its state remembered on the device and its item count on the header while collapsed; then one pinned footer row holding the account (avatar and name, opening the account menu), the assistant launcher when the assistant is available, notifications and the sync status; then, under it, the brand line (see "Brand line in the sidebar footer"). Every group, row and count SHALL be those of the current workspace. On a device that has not stored a state for a group, Projects SHALL start open and Labels and Views SHALL start closed. From 768 px with a fine pointer, More SHALL instead be a row after the primary destinations that opens a menu of those destinations, carrying the same marker on the row. The Views group SHALL be shown only once the user has a saved view in the current workspace and the Labels group only once the user has a label there; an empty group shows nothing, not a placeholder sentence.

Outside Open Loops first, the primary destinations SHALL be listed in the user's destination order (`appearance-preferences` "Primary destination order"); the table below gives the default order.

Counts SHALL follow the user's sidebar counts preference (`appearance-preferences` "Sidebar counts preference").

With the default (Inbox and Today):
- counts SHALL be visible at all times on Inbox, Today and collapsed group headers only;
- a project's count SHALL be visible while its row is hovered or focused, and at all times on a coarse pointer;
- favourites follow the rule of their own kind;
- view rows and label rows SHALL show no count.

With every count on:
- project, label and saved-view rows and their favourites SHALL show their open-task count at all times, and no number while the count is zero; dashboards show none;
- on a fine pointer, while such a row is hovered or focused, its menu button SHALL take the count's place without the row growing.

Every row that has a count SHALL carry it in its accessible name. The unread badges of shared projects and of Updates are governed by `activity-feed` and are unchanged. The workspace control SHALL carry one accent dot while another workspace has unread updates, with the workspace names in its tooltip and accessible name.

The primary destinations and the More group SHALL depend on the user's "How you work" preference:

| Preference | Primary destinations | More group |
| --- | --- | --- |
| `lists` and `companion` | Inbox, Today, Upcoming, Calendar (Day or Week, as last used) | Loop home, Next, Waiting, Anytime, Someday, Assigned to me, Completed, Updates, Locations, Trash, New view, Review, Statistics, Ask when available |
| `first` | Loop home, Inbox, Today, Next, Waiting, Review | Upcoming, Calendar, Anytime, Someday, Assigned to me, Completed, Updates, Locations, Trash, New view, Statistics, Ask when available |

In `first` mode the primary destinations SHALL never exceed six and SHALL keep the order above. Promoted destinations SHALL be listed in the More group, and the stored promotion list and destination order SHALL be kept unchanged. The workspace control is not a destination and SHALL not count against the six.

#### Scenario: Default sidebar
- **WHEN** a user with projects, labels, saved views and no favourites opens the app on a 1280×800 screen on a device that never stored a group state
- **THEN** the workspace control, five primary destinations and the More group are visible above Projects (open), Labels (closed, "Labels 3") and Views (closed, "Views 2"), no Favourites group is shown, the footer is one row that is visible without scrolling, and only the middle part scrolls when the project tree is long

#### Scenario: One workspace
- **WHEN** an account that never created a workspace opens the app
- **THEN** the control shows the picture "P" and "Personal" on one line and opens the switcher with the one workspace, "New workspace" and "Manage workspaces"

#### Scenario: Groups follow the workspace
- **WHEN** the user switches from "Personal" (4 projects, 2 labels, 1 filter) to "Work" (6 projects, no labels, no filters)
- **THEN** the Projects group lists Work's six projects, no Labels or Views group is shown, the Favourites group shows Work's pinned items or nothing, and Inbox and Today show Work's counts

#### Scenario: Only two numbers at rest
- **WHEN** the same user has 8 Inbox tasks, 10 due today, projects with open tasks, labels in use and saved views with matches, and nothing is hovered or focused
- **THEN** the only visible counts in the sidebar are "8" on Inbox and "10" on Today (plus the item counts on the closed Labels and Views headers), and the Upcoming row shows no number

#### Scenario: Labels are reachable
- **WHEN** the user has forty projects and three labels
- **THEN** scrolling the middle part of the sidebar reaches the Labels group, and nothing inside it scrolls separately

#### Scenario: Promote a destination
- **WHEN** the user turns on "Show in sidebar" for Someday in Settings → Appearance
- **THEN** Someday appears among the primary destinations on every device of that user after sync, and leaves the More group

#### Scenario: Collapse a group
- **WHEN** the user has six saved views and collapses the Views group, then reloads the app on the same device
- **THEN** the Views header reads "Views 6" with no rows under it, and on the user's other devices the Views group keeps its own state

#### Scenario: Stored state wins over the default
- **WHEN** the user opened the Labels group on this device before this version, so the device stores it as open, and the app is updated
- **THEN** the Labels group is still open on this device, and a device that never stored a state shows it closed

#### Scenario: Two groups closed
- **WHEN** the user collapses Views and Labels
- **THEN** the Projects group has the whole height of the scroller, and its "All" and add actions still work on the collapsed groups' headers

#### Scenario: More open on a phone
- **WHEN** a user with 25 projects opens the drawer on a 390×640 phone, opens More and swipes up on the drawer
- **THEN** the drawer's scroller, which holds More and the groups below it, scrolls and reaches the last project, the workspace control, the primary destinations and the footer stay in place, and the page behind the drawer does not move

#### Scenario: More on a desktop
- **WHEN** a user on a 1280×600 screen with a mouse selects More
- **THEN** a menu lists the More destinations below the row, the projects keep their place in the scroller, choosing Someday opens it and closes the menu, and the More row is marked current while Someday is open

#### Scenario: No empty groups
- **WHEN** a new account with no saved view and no label opens the app
- **THEN** the sidebar shows no Views or Labels group and no placeholder sentence, and saving a first view brings the Views group back, closed, with its All action and "Views 1" on its header

#### Scenario: Favourites first
- **WHEN** the user has pinned a project, a label and a saved view
- **THEN** the Favourites group is the first group of the scroller, above Projects, the pinned project's count appears on hover and the pinned label and view show no count, and the Labels and Views groups are collapsed on a device that never stored a group state

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

#### Scenario: Every count on
- **WHEN** the user chose "Every list" for sidebar counts and has "Website launch" (5 open tasks), the label "errand" (3), the view "Waiting" (2), a project with nothing open, and nothing hovered
- **THEN** the rows read "Website launch 5", "errand 3" and "Waiting 2", the empty project shows no number, and each accessible name still states its count

#### Scenario: Menu in the count's place
- **WHEN** every count is on and the user points at "Website launch" with a mouse
- **THEN** the "5" is replaced in the same place by the row's ⋯ button, the row does not grow, and the number comes back when the pointer leaves

#### Scenario: Collapsed parent totals
- **WHEN** every count is on and the user collapses "Home" (2 open tasks) whose sub-projects hold 3 and 4
- **THEN** the "Home" row reads 9, and expanding it shows 2 on "Home" and 3 and 4 on its sub-projects

#### Scenario: Reordered destinations
- **WHEN** a Companion user who promoted Someday moved Today above Inbox and Someday above Upcoming in Settings → Appearance
- **THEN** the primary destinations read Today, Inbox, Someday, Upcoming, Calendar on every device after sync, and in Open Loops first they read Loop home, Inbox, Today, Next, Waiting, Review

### Requirement: Page template
Every view SHALL render a page header and, below it, its content, inside one inset content surface (precision-shell D1). There SHALL be two page heads:

- A **day page** (Today and Upcoming) SHALL have a top row with the sidebar toggle on the left and the page's actions on the right, then the title at the display step with its lead line (the date and the day's totals) beside it at the prose step, in the muted tone, then an optional briefing at the prose step: one or two sentences about the day.
- Every other page SHALL have a **compact header**, one 46 px row: the sidebar toggle, then the title at the header title step (a colour dot or icon, or a breadcrumb, before it), then the lead line (the page's meta: totals, members and role, a count, a read-only note) in the muted tone at the metadata size beside the title, then at most two visible actions, an overflow menu for the rest and the Help action at the right.

A second header row MAY hold the page's view tabs or filter chips on the left and its view tools (filter, display, panel) on the right. The header SHALL stay visible while the content scrolls. Content SHALL use the full width of the content surface, with the same side padding on every page, so every page's title and first row start at the same horizontal position; a settings or form page keeps its fields at 42 rem from that left edge. A board or a timeline scrolls sideways inside the surface rather than widening it, and switching a project between list, board and timeline SHALL not move its title or actions.

Below 768 px the shell's bar SHALL carry the title of every page except a day page and show the lead line as its subtitle on one line, cut at the bar's edge, so a lead line that arrives with the data does not grow the bar; on a project the subtitle is plain text, and members and public links open from Share. A day page below 768 px SHALL keep its head in the page, under the bar: the title at the display step, the lead line and the briefing, scrolling with the list rather than staying on screen; the bar then carries no title (see "No desktop top bar").

When the panel opens as a column, the content surface SHALL narrow by the panel's width from its right side: no title or row SHALL move horizontally when the panel opens or closes. Nothing SHALL slide. This is presentation only, reads nothing from the server and behaves the same offline.

#### Scenario: Same left edge
- **WHEN** the user moves between Inbox, Today, Labels, Trash, the Filter view and a project on a 1280 px screen
- **THEN** the title and the first row start at the same horizontal position in all six, at the content surface's left edge plus the page padding

#### Scenario: A lead line under the title
- **WHEN** Today is opened on a 1280 px screen with 5 h 15 m planned and 40 m tracked
- **THEN** the top row holds the sidebar toggle and the page's actions, and "Today" is at the display step with "Wednesday 21 October · 5 h 15 m planned · 40 m tracked" beside it in the muted tone

#### Scenario: Centred on a wide screen
- **WHEN** Today is open with the panel closed on a 2560 px screen with the sidebar at its default width
- **THEN** nothing is centred: the rows span the content surface from its left padding to its right padding, and the header's actions end at the rows' right edge

#### Scenario: The panel docks
- **WHEN** Today is open on a 1920 px screen and the user opens a task
- **THEN** the panel is a 30 rem column at the right, the content surface narrows from its right side, and the title and every row keep their horizontal position within 1 px

#### Scenario: No room to move
- **WHEN** Today is open on a 1024 px screen and the user opens a task
- **THEN** the content surface narrows from its right side and the title does not move horizontally

#### Scenario: Opening and closing a task moves no row
- **WHEN** the user opens a task and closes it again on Today and on a project, at 1280, 1440 and 1920 px
- **THEN** the first row and the title are at the same horizontal position, within 1 px, before, while and after the panel is open

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and a task is opened on a 1920 px screen
- **THEN** the list does not move at all, and the panel appears without sliding in

#### Scenario: List, board and timeline keep the header still
- **WHEN** the user switches "Q4 launch" from List to Board to Timeline on a 1440 px screen
- **THEN** the project title and the List/Board/Timeline control stay at the same position in all three, and only the content below changes

#### Scenario: A project list fills its frame
- **WHEN** a project is shown as a list on a 1440 px screen with the panel closed
- **THEN** its rows span the content surface from its left padding, the title starts at the same place as on the board, and the header's actions end at the rows' right edge

#### Scenario: Wide board inside the frame
- **WHEN** a board has eight columns on a 1280 px screen
- **THEN** the board scrolls sideways inside the content surface and the header keeps its width and position

#### Scenario: Actions in the header
- **WHEN** a project has Share, Rename, Move, Archive, Activity and History actions
- **THEN** the header shows the List/Board control and Share, and the remaining actions are in the overflow menu

#### Scenario: Phone bar carries the lead line
- **WHEN** a project with 4 open tasks is open on a 390 px screen
- **THEN** the shell's bar shows the project's name with its lead line under it as its subtitle, and the page shows no second title

#### Scenario: The day head on a phone
- **WHEN** Today is open on a 390×844 screen with a two-sentence briefing
- **THEN** the bar shows the menu button and the page's actions only, "Today" is in the page at the display step with the date line beside or under it and the briefing below, there is one level-one heading, and scrolling the list moves the head up with it while the bar stays

#### Scenario: Long lead line on a phone
- **WHEN** a shared project with a public link opens at 360 px and "2 · owner · Public" is wider than the space beside the title
- **THEN** the subtitle stays one line, cut at the bar's edge with its full text reachable, and the bar keeps its height

#### Scenario: Header as wide as its list
- **WHEN** the Inbox is open on a 1920 px screen with the panel closed
- **THEN** the list spans the content surface, and the header's last action ends at the list's right edge within 2 px

#### Scenario: One project frame for every layout
- **WHEN** a project with three sections is switched from List to Board on a 1920 px screen
- **THEN** the List/Board/Timeline control does not move, and the board and the list end at the same right edge as the header's actions

#### Scenario: Compact header on a tool page
- **WHEN** a project, the Inbox or Settings is open on a 1440 px screen
- **THEN** the header is one 46 px row: the sidebar toggle, the title at 14 px with its dot or icon, the lead line beside it, then the actions, the overflow menu and Help at the right

### Requirement: No desktop top bar
From 768 px wide the shell SHALL have no bar above the content column; search SHALL be a button beside the app name in the sidebar, notifications, sync status and help SHALL live in the sidebar footer, and page actions in the page header. Below 768 px a bar SHALL show the menu button, the page title and up to two page actions, with the remaining actions in an overflow menu. On a day page (Today, Upcoming) the bar SHALL show no title and no dividing line, since the page shows its own head (see "Page template"). On a page that offers Back (the task page, a nested page) Back SHALL take the menu button's place.

#### Scenario: Desktop height for content
- **WHEN** the Inbox is open on a 1280×800 screen
- **THEN** the first task is visible within the top 160 px of the content column

#### Scenario: Phone bar
- **WHEN** a project is open on a 390 px screen
- **THEN** the bar shows the menu button, the project name and the List/Board control, and Share is in the overflow menu

#### Scenario: Phone bar on a day page
- **WHEN** Today is open on a 390 px screen
- **THEN** the bar shows the menu button and Today's actions, no title, and no line under it

#### Scenario: Back in the menu's place
- **WHEN** a task is open as its page on a 390 px screen
- **THEN** the bar starts with Back, named "Back to the list", and has no menu button

### Requirement: Sync status is quiet
Sync status SHALL be a dot in the sidebar footer, green when synced, animated while syncing, grey when offline and red on error, with the text ("Synced", "3 pending", "Offline") in its tooltip and announced to assistive technology. The text SHALL be visible beside the dot only while offline, on error, while changes are pending, or while the sync is stale. The sync SHALL count as stale when the dot would otherwise read synced or syncing but the last successful sync is more than 15 minutes old (or the page has been open for 15 minutes without one): the dot SHALL then be amber and read "Not synced since {time}" ("Not synced yet"), and a click SHALL sync now.

#### Scenario: Synced
- **WHEN** the device is online, live and has no pending changes
- **THEN** only the dot is shown, and hovering or focusing it reads "Synced · live updates connected"

#### Scenario: Pending offline
- **WHEN** the device is offline with two unsynced changes
- **THEN** the footer reads "Offline · 2 pending" beside the grey dot

#### Scenario: Data stopped arriving
- **WHEN** the device is online and its last successful sync was an hour ago without an error
- **THEN** the footer reads "Not synced since" with that time beside an amber dot, never "Synced"

### Requirement: Notices are toasts
Shell notices (a removed start view, a change the server refused, a reminder, an undo offer) SHALL appear as toasts in one stack in the bottom corner, SHALL not push content, SHALL be dismissable, and SHALL be announced to assistive technology. A toast that offers an action SHALL stay until acted on or dismissed; an informational toast SHALL leave after eight seconds.

#### Scenario: Refused change
- **WHEN** the server refuses a change after a role change
- **THEN** a toast explains it with a Dismiss action, and the list does not move

### Requirement: The panel slot has an address
The shell SHALL own one panel slot to the right of the content. It SHALL host project activity, project history and the calendar's planning list, one at a time. From 1024 px it SHALL host a task only on a page that keeps a split: Process the Inbox, the Inbox, and with the side panel preference the lists of `web-app` "Task details in a side panel". Everywhere else a task opens as its page at `/task/<id>` (see `web-app` "Task page"). A docked task's id SHALL be in the address (`?task=<id>`), so reloading or sharing the link reopens it; a `?task=<id>` address opened on any other page SHALL open the task's page. Escape or Close SHALL empty the slot and return focus to the row or control that opened it; with the side panel, Escape on the list leaves the panel as it is and Close also closes the side panel (see `web-app` "Task details in a side panel").

#### Scenario: Reload with a task open
- **WHEN** the user has a task's page open, opened from Upcoming, and reloads
- **THEN** the same task's page opens, and Close goes to the task's own list

#### Scenario: One occupant
- **WHEN** project activity is shown in the slot and the user opens a task
- **THEN** the task opens as its page and the slot is empty behind it

#### Scenario: A list with the side panel docks the task
- **WHEN** a user with the side panel preference clicks a task in a project on a 1440 px wide screen
- **THEN** the task shows in the slot beside the project's list, the address is the project's with `?task=<id>`, and no page opens

### Requirement: Panel width and expansion
From 1024 px the panel SHALL be a 26 rem column, 30 rem from 1440 px; on a page that keeps a split it SHALL be about half the content's width (at least 26 rem, at most 44 rem) until the user resizes it. A docked task SHALL offer an Expand action that opens it as its page at `/task/<id>`. Between 768 and 1023 px the slot's other occupants SHALL be a sheet of at most 28 rem over the content column, and below 768 px a bottom sheet; a task never docks there and opens as its page.

Wherever a task docks, the panel's left edge SHALL be a resize handle. Dragging it SHALL change the panel's width. The handle SHALL be a focusable separator named "Resize the task panel" that announces its width: ← and → widen and narrow the panel by 16 px (64 px with Shift), and Home or a double click restores the default. The width SHALL be kept on the device and used by every page that keeps a split. It SHALL never be synced, because widths suit a screen and not an account. It SHALL stay between 22 rem and the window's width less 38 rem (at most 64 rem), so the list always keeps room; a narrower window shrinks the panel without forgetting the chosen width.

#### Scenario: Expand a long note
- **WHEN** the user activates Expand on a task docked beside the triage card
- **THEN** the task's page opens at `/task/<id>`

#### Scenario: The list stays in sight on a phone
- **WHEN** the user opens a task from Today on a 390×844 phone and taps Back
- **THEN** the task opened as its page, not as a sheet, and Today is back at the same scroll position with the task selected

#### Scenario: Resize and remember
- **WHEN** the user drags the docked task's left edge 200 px to the left on a 1600 px wide screen, then reloads and opens a task in the Inbox
- **THEN** the panel is 200 px wider than before, and after the reload the Inbox's panel has the same width

#### Scenario: Resize with the keyboard
- **WHEN** the user tabs to the panel's resize handle and presses ← three times, then Home
- **THEN** the panel widens by 48 px, the handle announces each new width, and Home returns it to the default width

#### Scenario: Another device keeps its width
- **WHEN** the user widens the panel on a desktop and opens the Inbox on a laptop of the same account
- **THEN** the laptop's panel has its own width, unchanged

#### Scenario: The list keeps room
- **WHEN** the user drags the handle as far left as it goes on a 1280 px wide window
- **THEN** the panel stops at the window's width less 38 rem, and the list's rows drop their right-hand cells as their width requires

### Requirement: Phone navigation
Below 768 px the shell SHALL show a bottom tab bar with Inbox, Today and Upcoming in the user's primary destination order (`appearance-preferences` "Primary destination order"), then Search. With no stored order that is Inbox, Today, Upcoming and Search. Search is not a destination and SHALL stay last, and the bar SHALL NOT gain further destinations. The phone drawer opens from the shell bar's menu button (see "Phone drawer"). The bar SHALL mark the current tab in the strong text tone rather than the accent, and a floating add button at the bottom right above the bar SHALL open quick add as a bottom sheet with the keyboard up. The bar and the button SHALL hide while a sheet is open and on the task page, which has its own bar with Back and the next and previous task. Tabs SHALL be at least 48 px tall and SHALL respect the bottom safe area. Every list SHALL reserve the add button's footprint under its last row, so the button never covers a row or its metadata. While the content scrolls down by more than 24 px the bar SHALL minimise to its icons and the button SHALL slide out below it; on any scroll up, at the end of the content, or 600 ms after scrolling stops, both SHALL return. When the system requests reduced motion the bar and the button SHALL stay in place at all times. This is presentation only; every action behind the bar and the button is the same local operation offline.

#### Scenario: Two taps to any primary view
- **WHEN** the user is in a project on a phone and taps Today in the bar
- **THEN** Today opens without the drawer

#### Scenario: Four tabs
- **WHEN** the Inbox is open on a 390 px phone and the user has never reordered destinations
- **THEN** the tab bar shows Inbox, Today, Upcoming and Search in that order, Inbox is marked current in the strong text tone, and no tab is in the accent colour

#### Scenario: Tab order follows the sidebar
- **WHEN** the user moved Today above Inbox in Settings → Appearance and opens the app on a 390 px phone
- **THEN** the tab bar shows Today, Inbox, Upcoming and Search, Search is last, and no tab is in the accent colour

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
From 1024 px the sidebar SHALL be resizable by dragging its edge between 15 rem and 22.5 rem, remembered per device, and SHALL be collapsible to icons with the sidebar toggle in the page header (and, on the collapsed rail, an Expand control in its footer) and the shortcut `[`.

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
From 768 px the sidebar footer SHALL be one row: the account control (the person's avatar and name, truncated when the row is narrow) that opens the account menu, then, as icon buttons each with its name as tooltip and accessible name, the assistant launcher when the assistant is available, notifications, the sync dot and, while the sidebar is the collapsed rail, an Expand control (the page header's sidebar toggle collapses it). The account menu SHALL offer Settings, Help, Something isn't working, and Keyboard shortcuts, the first, second and fourth with their registered shortcuts shown, and after a separator Sign out, which opens the same confirmation as Settings → Account. Something isn't working SHALL have no shortcut. Below 768 px the footer SHALL be the same row with touch-height targets. With a fine pointer, sidebar rows SHALL be 32 px high and group headings tighter; with a coarse pointer rows keep their touch height. The sidebar's scroller SHALL have a thin scrollbar in the theme's border colour, stronger while the pointer or focus is inside it, and SHALL fade its top or bottom edge only while content is hidden past that edge, leaving the scrollbar itself unfaded.

#### Scenario: Short desktop window
- **WHEN** a user with twelve projects opens the app in a 1280×600 window with a mouse
- **THEN** at least eight projects are visible in the sidebar without scrolling, the footer takes one row, and the bottom edge of the scroller fades while projects are hidden below it

#### Scenario: Footer names
- **WHEN** a screen reader user moves through the footer row on a desktop
- **THEN** each control announces its name (the person's name as the account menu button, Notifications with its unread count, the sync status), and the account menu's items announce Settings, Help, Something isn't working, Keyboard shortcuts and Sign out, with the shortcuts of Settings, Help, Keyboard shortcuts and Sign out as descriptions

#### Scenario: Help from the account menu
- **WHEN** the user opens the account menu and chooses Help, then later presses `g` then `?` from the Inbox
- **THEN** the Help page opens both times, the account control is marked current while Help, Settings or Import is open, and the page header's Help action and the command palette's "Open Help" still open it too

#### Scenario: Something isn't working from the account menu
- **WHEN** the user opens the account menu and chooses Something isn't working
- **THEN** the feedback dialog opens and the footer stays one row

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
The Favourites group of the Tasks space SHALL list the user's pinned projects, labels and saved filters in the user's order, each with the icon or colour and the live open-task count its own group shows, opening the same destination. Pinned standalone notes SHALL be listed in the Notes space's Pinned group instead (see "Sidebar spaces"), and the favourites list SHALL keep their entries unchanged. Items SHALL be reorderable from their menus and by keyboard, and unpinnable from their menus. The group SHALL reflect pins, order and renames from the user's other devices after sync, and SHALL render from local data so it is correct offline.

#### Scenario: Mixed kinds in order
- **WHEN** the user pins "Website launch" (project, 5 open), "Deep work" (filter, 4 matches) and "errand" (label, 3 open) and moves "Deep work" to the top
- **THEN** the group reads "Deep work 4", "Website launch 5", "errand 3" on this device now and on other devices after sync, and each row opens its view

#### Scenario: Pinned item removed
- **WHEN** a pinned project is archived or deleted on another device and this device syncs
- **THEN** it leaves the Favourites group without a reload and reappears if it is restored

#### Scenario: Pinned offline
- **WHEN** the device is offline and the user pins a label
- **THEN** it appears in Favourites at once, survives a reload, and reaches the user's other devices when the network returns

#### Scenario: Pinned note
- **WHEN** the user pins the note "Wi-Fi" and renames it "Home Wi-Fi" on another device
- **THEN** the Tasks space's Favourites group does not list it, the Notes space's Pinned group shows "Home Wi-Fi" after sync, and the favourites list still holds the note for other clients

### Requirement: Sidebar header row
The top of the sidebar SHALL be one header row holding the workspace control on the left (the current workspace's picture and name, see "Workspace picture") and the search and commands button on the right. The instance's mark and name SHALL be in the brand line at the sidebar's end, not in the header (see "Brand line in the sidebar footer"). The header row SHALL keep its left part a slot holding the workspace control, while the search button and everything below the row stay unchanged. On the icon rail the row SHALL show the workspace's picture alone, centred, with the workspace's name as its tooltip and accessible name. The workspace's name SHALL be set in the interface typeface at the body size with the strong text tone. The header row SHALL be rendered from local data only and SHALL look the same offline.

#### Scenario: Header at rest
- **WHEN** a user opens the app on a 1280×800 screen in light and in dark
- **THEN** the sidebar starts with the workspace's 20 px picture, its name and the search button in one row of 40 px or less, and no tick-in-a-square image and no app mark is in the header

#### Scenario: Icon rail
- **WHEN** the user collapses the sidebar with `[`
- **THEN** the header row shows the workspace's picture alone, hovering or focusing it reads the workspace's name, and the search button moves to the footer as before

#### Scenario: Branded header
- **WHEN** the owner set a logo and the name "Acme Tasks"
- **THEN** the header row shows the workspace's picture and name, and the logo and "Acme Tasks" are in the brand line at the sidebar's end

#### Scenario: Replaceable left part
- **WHEN** the workspace control renders in the header's left part
- **THEN** the search button keeps its place and shortcut, the primary destinations start at the same vertical position, and the sidebar's tests for the destinations, groups and footer pass unchanged

### Requirement: Sidebar tones
Sidebar rows SHALL use three tones. An inactive row and its icon SHALL use the quiet text tone (the step below `muted` in the tone scale); while hovered or focused the row SHALL raise its label and icon to the default text tone over the sunken surface; the active row SHALL be a pill on the neutral selected surface with the strong text tone, its icon in the same tone and its count in the muted tone (precision-shell D5: colour is kept for state). Group headers SHALL use the quiet tone at the hint size, uppercase. Counts SHALL use the quiet tone and tabular figures. Every tone on every sidebar surface SHALL meet 4.5:1 for text and 3:1 for icons, measured by the token contrast test in both themes, on the sidebar surface and the selected surface. The tones are tokens, so a theme or accent change switches them without a reload.

#### Scenario: Three tones in one list
- **WHEN** Today is open and the pointer rests on Upcoming
- **THEN** Today is a pill on the selected surface with strong text and icon, Upcoming shows default-tone text and icon on the sunken surface, and every other row shows quiet-tone text and icons

#### Scenario: Contrast on the tinted sidebar
- **WHEN** the token contrast test runs
- **THEN** it measures the quiet, default and strong text tones against the sidebar surface token, and the default, strong and muted tones against the selected surface, in light, dark and high contrast, and fails naming the pair when one is under its minimum

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
- **THEN** the footer is one row reading avatar, "1:05 · Write the report" in a pill with a Stop control, then the assistant, bell and sync dot, and no second line exists above or below it

#### Scenario: Stop from the pill
- **WHEN** the user activates Stop inside the pill
- **THEN** the entry ends with the local time, the pill is replaced by the account name without the row moving, "Tracking stopped" is announced once, and the task panel does not open

#### Scenario: Account menu while tracking
- **WHEN** the user activates the avatar while the pill is shown
- **THEN** the account menu opens with the person's name as its name and Settings, Help, Something isn't working, Keyboard shortcuts and Sign out

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
From 768 px with a fine pointer the sidebar's background SHALL be the sidebar surface token, which is the plain canvas in every accent theme and colour scheme (the accent tint of sidebar-v2 is retired: Precision keeps colour for state), so the sidebar reads as part of the window around the inset content surface. The sticky group headers SHALL use the same token so scrolling never shows a seam. The sidebar SHALL never be translucent over content, and the high-contrast override SHALL keep the sidebar surface the plain canvas. The phone drawer and the sheets SHALL keep their surface colour.

#### Scenario: Tint follows the theme
- **WHEN** the user switches the accent theme from emerald to blue and the colour scheme from light to dark
- **THEN** the sidebar surface becomes the dark canvas with no accent mixed in, the sticky headers match it, and nothing in the sidebar's background follows the accent

#### Scenario: No seam while scrolling
- **WHEN** the user scrolls a sidebar with forty projects
- **THEN** the sticky Projects header shows the sidebar surface colour, and no band of a different colour appears above the rows

#### Scenario: High contrast
- **WHEN** the user turns on high contrast
- **THEN** the sidebar is the plain canvas, as it is without high contrast, and every sidebar pair meets the high-contrast minimums

#### Scenario: Phone keeps the surface
- **WHEN** the window is 390 px wide and the drawer opens
- **THEN** the drawer has the surface colour, not the sidebar tint

### Requirement: Phone drawer
Below 768 px, the menu button at the start of the shell's bar SHALL open a drawer from the left edge, at most 85 percent of the viewport width and at most 20 rem, over a scrim that closes it on tap. The drawer SHALL NOT repeat the tab bar's destinations. It SHALL show, top to bottom, in one scroller: the find field, the primary destinations the tab bar does not hold (Calendar in Lists and Companion; Loop home, Next, Waiting and Review in Open Loops first), the More group, then Favourites, Projects, Labels and Filters as rows at least 48 px tall following the sidebar's counts and grouping rules; then a pinned footer with the account row (opening Settings, Help, Something isn't working, Keyboard shortcuts and Sign out), the assistant launcher when the assistant is available, notifications and the sync status. Choosing a destination SHALL close the drawer. The drawer SHALL use the sidebar's tones. The page behind the drawer SHALL NOT scroll while it is open.

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

#### Scenario: Something isn't working from the drawer
- **WHEN** the user taps the account row in the drawer's footer and chooses Something isn't working
- **THEN** the feedback dialog opens and the drawer is closed

### Requirement: Sidebar toggle in the header
From 1024 px every page header SHALL begin with the sidebar toggle: an icon button that collapses the sidebar to its icon rail and expands it again, shows its state (pressed while the sidebar is expanded), names the action as its accessible name ("Hide sidebar" or "Show sidebar") and shows its shortcut `[` in its tooltip. The toggle SHALL be the same control on every page, so it stays in one place when the user moves between pages. Below 1024 px the header shows no toggle (the sidebar does not collapse there, and below 768 px it is a drawer).

#### Scenario: Collapse from the header
- **WHEN** the user clicks the sidebar toggle at the start of the Inbox's header on a 1440 px screen
- **THEN** the sidebar becomes the icon rail, the toggle shows itself not pressed with the name "Show sidebar", and the content surface widens

#### Scenario: Same place on every page
- **WHEN** the user moves from Today to a project and to Settings → General
- **THEN** each page header starts with the sidebar toggle, and on Today and the project it is at the same position

#### Scenario: No toggle on a tablet
- **WHEN** the window is 900 px wide
- **THEN** no page header shows the sidebar toggle

### Requirement: Schedule in the sidebar
The sidebar SHALL offer a Schedule section between its scroller and its footer, folding like a sidebar group, closed until the user opens it and remembered on the device. Open, it SHALL show the current time and today's timed tasks and timed calendar events that have not ended, in start order, marking the one in progress, at most five, with a link to the Day calendar that counts the rest. A task SHALL open in the side panel where the page has one, an event SHALL open its details. The section SHALL not scroll on its own and SHALL not show in the icon rail or the phone drawer.

#### Scenario: Keeping the day in sight
- **WHEN** at 10:05 a user with tasks at 08:00, 10:00 (an hour) and 14:00 and an event at 12:00 opens Schedule
- **THEN** it reads "Now 10:05" and lists the 10:00 task marked as now, the 12:00 event and the 14:00 task, and stays visible while the projects scroll

#### Scenario: Opening a task beside the list
- **WHEN** the user clicks the 14:00 task in Schedule while the Inbox is open
- **THEN** the task opens in the side panel next to the Inbox

#### Scenario: More than fits
- **WHEN** seven timed tasks are still ahead today
- **THEN** five are listed and the link reads "2 more today" and opens the Day calendar

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** Schedule shows the tasks and the cached events of today, and asks for no events while no subscription is known on the device

### Requirement: Focus in the More group
The More group SHALL list Focus after Statistics, in every "How you work" mode, opening `/focus`. Focus SHALL be promotable to the primary destinations through the sidebar destinations preference, except in Open Loops first, where it stays in More. It SHALL show no count and no marker.

#### Scenario: Listed in More
- **WHEN** the user opens the More group, in any mode
- **THEN** Focus is listed after Statistics and opens the Focus screen with today's focus or the task picker

#### Scenario: Promoted
- **WHEN** a Companion user turns on "Show in sidebar" for Focus in Settings → Appearance
- **THEN** Focus appears among the primary destinations on every device after sync and leaves the More group

#### Scenario: Open Loops first
- **WHEN** the same user switches to Open Loops first
- **THEN** Focus is back in the More group, the six primary destinations are unchanged, and the promotion is kept for a later switch back

### Requirement: No floating add button on Settings
Below 768 px the shell SHALL hide the floating add button while Settings is open, because Settings has no quick-add action and the button would cover the chevrons at the end of its rows. The tab bar SHALL stay. The button SHALL return on the next view that offers quick add, and SHALL remain available while a quick-add sheet opened from another view is open.

#### Scenario: Settings on a phone
- **WHEN** the user opens Settings on a 390 px phone
- **THEN** the tab bar stays visible, the floating add button is gone, and none of Settings' row chevrons is covered

### Requirement: Screens off the start path load on demand
The shell SHALL keep the Inbox, Today, Upcoming and a project's list on its first screen, and SHALL load the Calendar (Day and Week), Settings, Import and a project's Calendar layout from their own chunks when their route or layout is first shown. Those screens' components and their static imports SHALL NOT be part of the entry chunk or the first load's static imports. While a chunk is fetched the content column SHALL show the shared row skeleton as one accessible status, with the sidebar, page bar and keyboard shortcuts still usable. No screen SHALL require a chunk preloaded while the app is idle, on speculation, or by an earlier visit to a different screen.

The service worker SHALL precache every emitted chunk, so a route whose chunk was precached opens offline with its local data after the first visit. A chunk that is missing after an upgrade SHALL leave the shell usable without losing the route's address.

#### Scenario: First visit to the calendar
- **WHEN** a user whose start screen is the Inbox opens Day or Week for the first time
- **THEN** the Inbox was drawn without downloading the Calendar chunk, the content column shows the row skeleton while that chunk loads, and the Day or Week grid then renders with the same address and keyboard shortcuts

#### Scenario: First visit to settings and import
- **WHEN** the user opens Settings from the sidebar and then Import from Settings on a device that has visited neither
- **THEN** each screen's chunk is fetched on that visit and each screen renders without a full page reload or a spinner

#### Scenario: Offline after one visit
- **WHEN** the device is offline and the user reopens Day, Settings or Import after having opened it once
- **THEN** the screen renders from the service worker's precache with the device's local data, and no request is needed to fetch its chunk

#### Scenario: Project Calendar layout
- **WHEN** a project is opened on a device that has never shown the project's Calendar layout, and the user switches that project to Calendar
- **THEN** the Calendar layout and its CalendarView chunk load then, and the project's list did not carry them on the first visit

### Requirement: The phone drawer is inert when closed and owns the page when open
Below 768 px the drawer SHALL be out of the tab order and out of the accessibility tree while it is closed: it SHALL carry inert and be hidden from assistive technology, and nothing inside it (the find field, the destinations, the account footer) SHALL be focusable or read. While it is open it SHALL behave as an overlay: it SHALL take focus when it opens, Tab and Shift+Tab SHALL stay inside it, the page behind it SHALL be inert and SHALL not scroll, Escape and the system Back SHALL close it, and focus SHALL return to the menu button that opened it. From 768 px the sidebar SHALL be a column: never inert, never hidden from assistive technology, and never marking the page as inert. The scrim SHALL belong to the open drawer, and a swipe on it SHALL not scroll the page behind.

#### Scenario: A closed drawer is skipped
- **WHEN** the Inbox is open on a 390 px phone and the user presses Tab from the menu button
- **THEN** focus leaves the bar for the page content, never entering the off-screen drawer, and a screen reader does not list the drawer's destinations

#### Scenario: The open drawer holds focus
- **WHEN** the user opens the drawer with the menu button
- **THEN** focus moves into the drawer, Tab and Shift+Tab cycle inside it, the page behind is inert and does not scroll, and the tab bar and add button leave the page

#### Scenario: Escape closes it and gives focus back
- **WHEN** the open drawer has focus and the user presses Escape
- **THEN** the drawer closes, becomes inert again, the page behind is interactive, and focus is back on the menu button

#### Scenario: The column is never inert
- **WHEN** the same account is open at 1280 px
- **THEN** the sidebar is not inert and not hidden from assistive technology, and the page behind it is not inert

### Requirement: Edit project appearance in the sidebar

The project row menus in Projects and Favourites SHALL offer Rename, Icon and Colour in that order to users who may edit the project under the project header's permissions. Changes SHALL use the existing project operations offline and converge per field on sync.

#### Scenario: Rename in the Projects group
- **WHEN** a user chooses Rename from a project row in Projects
- **THEN** the name becomes an editable field in the same row, Enter or leaving the field saves a valid change, and Escape cancels

#### Scenario: Rename a favourite project
- **WHEN** a user chooses Rename from a project row in Favourites
- **THEN** the existing name dialog opens

#### Scenario: Edit from either sidebar group
- **WHEN** a project owner or admin opens a project's menu in Projects or Favourites and renames it or chooses an icon or colour
- **THEN** the new value is saved to the same project and shown wherever the project is displayed

#### Scenario: A member cannot edit project metadata
- **WHEN** a project editor or viewer opens either sidebar menu
- **THEN** the menu omits Rename, Icon and Colour

### Requirement: Choose appearance while creating sidebar items

The sidebar New project form SHALL offer one control to the left of the name for choosing the icon and colour. The sidebar New label form SHALL offer one control in the same position for choosing the colour. These controls SHALL fit in the existing name row without helper text. A submitted choice SHALL be saved with the new item through the existing local operations and converge on sync. The usual defaults SHALL apply to choices the user leaves untouched.

#### Scenario: Set appearance before creation
- **WHEN** a user chooses an icon and colour for a new project or a colour for a new label and submits the form
- **THEN** the new item has the selected appearance immediately, including offline

#### Scenario: Create with defaults or cancel
- **WHEN** a user creates an item without changing its appearance, or cancels the form after choosing an appearance
- **THEN** a submitted item uses its usual defaults and a cancelled draft creates no item

### Requirement: Nothing appears above a list after it is shown
Once a list is on screen, nothing SHALL appear or grow above its rows unless the user asked for it there: a notice that arrives later (a removed start view, a change the server refused, a new version ready, an update the app refused) SHALL be a toast in the bottom corner, and a part of a page that loads after the list SHALL sit below its rows. The toasts SHALL keep their text and controls: the update prompt keeps "Reload to update" until reloaded, the refused update keeps its help link and Dismiss. This is presentation only and behaves the same offline.

#### Scenario: A new version while reading the Inbox
- **WHEN** a new release takes over the tab while the user reads the Inbox
- **THEN** "A new version of OpenTodo is ready." with "Reload to update" shows as a toast in the bottom corner, and no row of the Inbox moves

#### Scenario: Refused change
- **WHEN** the server refuses a change after a role change while Today is on screen
- **THEN** a toast explains it, and the list does not move

### Requirement: No floating add button in the rituals
Below 768 px the shell SHALL NOT show the floating add button on a screen that ends in its own action, so the button never covers that action: Focus and Close the day, which keep nothing else on screen, and every step of the Weekly review, which ends in Back and Next. The tab bar SHALL stay. The Daily check and the Monthly look, whose action is in the page header, SHALL keep the button, and the button SHALL return on the next view that offers quick add. Close the day SHALL draw one divider under the shell's bar on a phone, also while it offers Reopen the day.

#### Scenario: Focus on a phone
- **WHEN** the user opens Focus on a 390 px phone
- **THEN** the tab bar stays, the floating add button is gone, and it returns when the user opens Today

#### Scenario: Close the day after closing
- **WHEN** the user reopens Close the day on a 390 px phone after closing the day
- **THEN** Reopen the day shows in the page under the shell's bar, with one divider under the bar and no floating add button

#### Scenario: Weekly review on a phone
- **WHEN** the user opens the Weekly review on a 360 px phone
- **THEN** the tab bar stays, there is no floating add button, and nothing covers the step's Next button

#### Scenario: Leaving the review
- **WHEN** the user opens the Daily check from the review's menu, or the Inbox from the tab bar
- **THEN** the floating add button is back

### Requirement: Workspace picture
The workspace control at the top of the sidebar SHALL show the current workspace's own picture followed by its name on one line:
- the workspace's chosen icon from the icon set, drawn on its colour;
- without an icon, the first character of its name on its colour;
- without a colour, on the neutral raised surface.

The picture SHALL be 20 px with the control radius. The control's name SHALL be the workspace's name, never the instance's, and the app's check-mark SHALL NOT be used as a workspace's picture. On the icon rail the header SHALL show the picture alone, with the workspace's name in its tooltip and accessible name. The picture is drawn from the cached workspace and looks the same offline.

#### Scenario: Default workspace without an icon
- **WHEN** an account has only its default workspace "Personal" with no icon and no colour
- **THEN** the header shows "P" on the neutral surface and "Personal" beside it, and the app's mark is not in the header

#### Scenario: Chosen icon and colour
- **WHEN** the current workspace "Work" has the icon `briefcase` and a blue colour
- **THEN** the header shows the briefcase on blue and "Work"

#### Scenario: Rail
- **WHEN** the user collapses the sidebar with `[` while "Work" is current
- **THEN** the header shows the briefcase picture alone, and hovering or focusing it reads "Work"

### Requirement: Brand line in the sidebar footer
The sidebar SHALL end with one quiet line under the footer row: the instance's mark at 14 px and its name with the running version ("OpenTodo 0.22.0"), at the metadata size in the faint tone, turning muted on hover and focus. On a branded instance the line SHALL show the owner's logo and name, followed by the version. Activating the line SHALL open Settings › About, which holds What's new. While What's new has an entry the user has not read, the line SHALL carry the quiet accent dot, its meaning in its accessible name. On the icon rail the line SHALL show the mark alone. In the phone drawer it SHALL end the drawer. The line SHALL add no primary destination and no scroll region. It is rendered from local data and looks the same offline, with the version the app last received.

#### Scenario: Unbranded
- **WHEN** a user opens the app on a 1280 px screen of an unbranded server running 0.22.0
- **THEN** the sidebar ends with the mark and "OpenTodo 0.22.0" in the faint tone under the account row, and activating it opens Settings › About

#### Scenario: Branded
- **WHEN** the owner set the name "Acme Tasks" and a logo
- **THEN** the line shows the logo and "Acme Tasks 0.22.0", and the header shows the workspace's picture, not the logo

#### Scenario: Unread news
- **WHEN** a new What's new entry has arrived that the user has not opened
- **THEN** the line carries the accent dot and its accessible name says there is something new, and the dot goes once the user has opened What's new

### Requirement: Sidebar spaces
The sidebar SHALL have two spaces, Tasks and Notes, chosen with a two-option control under the workspace control, which is not a destination and does not count against the six primary destinations. In the Tasks space the sidebar SHALL be as "Sidebar structure" describes. In the Notes space the primary destinations and the groups SHALL be replaced by **All notes** (opening `/notes`), a **Pinned** group listing the user's pinned standalone notes of the current workspace in the favourites order, and a **Recent** group listing the five most recently changed standalone notes that are not pinned; each note row SHALL show the note icon and the title ("Untitled note" when empty) and open the note. The workspace control, search, the schedule and the footer SHALL be the same in both spaces. Choosing a space SHALL open its home (Tasks: the device's start view; Notes: `/notes`); choosing the space already shown SHALL do nothing. The space SHALL be kept on the device only, never synced; when storage is unavailable it SHALL hold for the visit. Opening the Notes page or a note, by any means, SHALL show the Notes space; opening a task, a project, a label, a view or any other task screen SHALL show the Tasks space; Settings, Help, Import, the theme editor, the Assistant page and the Trash SHALL keep the space as it was. In the icon rail the control SHALL be two icons named in their tooltips; in the phone drawer it SHALL be at the top, under the workspace control; the phone tab bar SHALL be the same in both spaces. The Notes space reads local data only, so it works offline, and its rows follow pins, renames and new notes from other devices after sync.

#### Scenario: Switch to Notes
- **WHEN** the user in Today selects Notes in the sidebar's control
- **THEN** the Notes page opens, the sidebar shows All notes, Pinned and Recent instead of the task destinations and projects, and the workspace control and footer stay where they were

#### Scenario: Back to Tasks
- **WHEN** the user whose start view is Today selects Tasks while a note is open
- **THEN** Today opens and the sidebar shows the task destinations and groups as before

#### Scenario: A link to a task
- **WHEN** the user in the Notes space follows a link in a note to a task
- **THEN** the task opens and the sidebar shows the Tasks space; Back returns to the note and the Notes space

#### Scenario: A note from the palette
- **WHEN** the user in the Tasks space opens a note from the search and command palette
- **THEN** the note opens and the sidebar shows the Notes space

#### Scenario: Settings keeps the space
- **WHEN** the user in the Notes space opens Settings
- **THEN** the sidebar still shows the Notes space

#### Scenario: Remembered on the device
- **WHEN** the user leaves the app in the Notes space on a laptop and reloads it at `/settings`
- **THEN** the sidebar shows the Notes space on the laptop, and the user's phone keeps its own space

#### Scenario: Pinned and recent
- **WHEN** the user has pinned "Wi-Fi" and "Packing list" and edited "Trip" a minute ago
- **THEN** the Notes space lists "Wi-Fi" and "Packing list" under Pinned in the pinned order and "Trip" first under Recent, and a pin made on another device appears after sync

#### Scenario: Phone drawer
- **WHEN** the user on a 390 px phone opens the drawer
- **THEN** the control is at the top of the drawer under the workspace control, and the tab bar below the page reads Inbox, Today, Upcoming and Search in both spaces

#### Scenario: Offline
- **WHEN** the device is offline and the user switches to Notes
- **THEN** the Notes space and the Notes page show from local data with no request

### Requirement: Edge swipe goes back or opens the phone menu
On a phone, a touch that starts within 20 pixels of the left edge and moves right past the reveal distance of the row swipes (64 pixels), or flicks right, SHALL go back exactly as the bar's Back does when the page has one (a task, a note, a nested page), and SHALL otherwise open the closed menu drawer, unless a dialog is open. A swipe that turns into a scroll or moves left SHALL do nothing, a mouse SHALL never start it, and a task or note row SHALL never take a press that starts in that strip. The iOS shell SHALL not offer the web view's history back gesture. The installed web app on an iPhone or iPad (Safari's standalone mode) SHALL not watch the edge, so the system's own back swipe is the only edge gesture there. The gesture changes nothing stored, works offline and has nothing to converge.

#### Scenario: Swipe from the edge
- **WHEN** a person on a phone swipes right from the left edge of Today
- **THEN** the menu opens, as when they tap the menu button

#### Scenario: Back from a task
- **WHEN** a person on a phone has opened a task from Today and swipes right from the left edge
- **THEN** Today is shown again, as when they tap Back, and the menu stays closed

#### Scenario: Installed web app on an iPhone
- **WHEN** a person uses the installed web app on an iPhone and swipes right from the left edge of a project they opened from Today
- **THEN** only the system's back swipe runs, and the menu stays closed

#### Scenario: Row swipes keep their place
- **WHEN** a person swipes a task row right starting in the middle of the row
- **THEN** the row's own swipe action runs and the menu stays closed

### Requirement: Room under the floating add button
Below 768 px every screen that shows the floating add button SHALL be scrollable until its last control is clear of the button, the tab bar and the bottom safe area. The room SHALL come from one shared rule: the content column keeps the button's footprint at its end while the button is offered. A screen that fills the column and scrolls inside itself (the calendar's Day and Week grid, the notes graph) SHALL run down to the tab bar and keep that room at the end of its own scroller, or keep its controls above the button where nothing scrolls. A screen that does not show the add button SHALL keep no room for it, and from 768 px no screen SHALL. A screen whose content already ends above the button SHALL NOT scroll because of the room. The rule is layout only: it reads and writes no data, and is the same offline.

#### Scenario: The last hour of the day
- **WHEN** the calendar's Day is scrolled to its end on a 360 × 740 phone
- **THEN** the 23:00 hour and a block in it are above the add button, and nothing that can be tapped is under the button

#### Scenario: The grid reaches the tab bar
- **WHEN** the calendar's Day or Week opens on a 390 × 844 phone
- **THEN** the grid runs down to the tab bar, with the add button over it, and the page itself does not scroll

#### Scenario: No room without the button
- **WHEN** Statistics, the Trash or a step of the Weekly review is scrolled to its end on a phone
- **THEN** its content ends at the tab bar, with no empty band the height of the add button under it

#### Scenario: A short page does not scroll
- **WHEN** the Inbox holds three tasks on a 390 × 844 phone
- **THEN** the page does not scroll

#### Scenario: From 768 px
- **WHEN** the calendar's Day or a list is open at 768 px or wider
- **THEN** no room for the add button is kept at the end of the page or of the grid

### Requirement: Help in the phone bar's menu
Below 768 px, on a page whose bar has a menu (the overflow menu or the page's own menu), the page's Help action SHALL be the last item of that menu, after a separator, and the bar SHALL show no Help button, so the title has that room. The item SHALL be named "Help", SHALL open the same guide section for the screen as the header's Help action does, SHALL be reachable with the menu's keyboard model (arrow keys, End, type-ahead), and focus SHALL return to the menu's button when the guide closes. A step that takes the menu's place (a picker inside the project menu) SHALL NOT show the item, and the bar SHALL NOT grow a Help button while that step is open. On a page whose bar has no menu that can hold the item, the bar SHALL keep the Help button. From 768 px the page header SHALL keep its Help button and its menus SHALL NOT repeat Help. This is presentation only: it reads and writes no data and behaves the same offline.

#### Scenario: Inbox on a small phone
- **WHEN** the Inbox is open on a 360 px screen
- **THEN** the bar shows the menu button, the title with its lead line, Process, Display options and the Inbox menu, and no Help button

#### Scenario: Help from the menu
- **WHEN** the user opens the "…" menu of a project on a 360 px screen and chooses Help, its last item
- **THEN** the guide's section for projects opens over the page, and closing it puts focus on the menu's button

#### Scenario: Help by keyboard
- **WHEN** the user focuses the bar's menu button on Today at 390 px, presses Enter, then End, then Enter
- **THEN** focus is on Help after End, and the guide's section for Today opens

#### Scenario: A page without a menu
- **WHEN** Settings is open on a 360 px screen
- **THEN** the bar shows the menu button, the title and the Help button

#### Scenario: A picker step
- **WHEN** the user opens a project's menu on a 360 px screen and chooses Move to…
- **THEN** the picker shows no Help item, and the bar behind it still has no Help button

#### Scenario: Wider screens
- **WHEN** the Inbox is open on a 1280 px screen
- **THEN** the header ends with the Help button, and the Inbox menu has no Help item

### Requirement: Pull down to sync on a touch device
On a touch device, a finger that pulls the page down from the top of the page's scroller SHALL ask for a sync now, once per pull, when it is released past the pull distance; a shorter pull SHALL do nothing. A mark SHALL follow the pull, SHALL stay while the sync runs and be announced to assistive technology as syncing, and SHALL go when the sync settles. The app SHALL never reload for a pull, and the open page, its scroll position and unsaved input SHALL stay as they were.

The pull SHALL start only with one finger, on a page scrolled to its top, with a move that is clearly vertical. It SHALL NOT start from a mouse, a trackpad or a wheel, in the strip at the left edge that belongs to the edge swipe, inside a scroller within the page that has something to scroll (the calendar grid, a board column), on a focused text field, while text is selected, on a handle that takes its own drag, while a drag is lifted, or while a dialog or sheet is open. A move that turns sideways SHALL be left to the row swipes. While another pulled sync runs, a pull SHALL ask for nothing more.

With reduced motion, the mark SHALL appear in place instead of following the finger and SHALL NOT turn.

The pull changes nothing stored. Offline, signed out or with the device locked, it SHALL say so in a toast with the sync status's own words ("Offline", "Signed out", "Locked"), a sync error SHALL be shown with its sentence, and pending changes SHALL stay queued as before. What the sync brings converges as any sync does; the pull adds no write path.

#### Scenario: Pull on Today
- **WHEN** a person on a phone pulls Today down from its top past the pull distance and lets go
- **THEN** one sync runs, the mark shows while it runs and goes when it ends, and Today is still open at its top

#### Scenario: A short pull
- **WHEN** a person pulls the list down a little and lets go
- **THEN** the mark returns and no sync is asked for

#### Scenario: Offline
- **WHEN** a person on a phone without a connection pulls the Inbox down and lets go
- **THEN** a toast says "Offline", nothing reloads, and their unsynced changes stay pending

#### Scenario: A scrolled list
- **WHEN** a person has scrolled a list down and drags a finger down
- **THEN** the list scrolls back and no sync is asked for

#### Scenario: A row swipe
- **WHEN** a person swipes a task row sideways on a list at its top
- **THEN** the row's own swipe runs and no mark appears

#### Scenario: Inside the calendar
- **WHEN** a person drags a finger down inside the Week grid
- **THEN** the grid scrolls or keeps its own gesture and no sync is asked for

#### Scenario: A mouse
- **WHEN** a person on a computer drags the list down with a mouse or scrolls up at the top with a trackpad
- **THEN** nothing happens, and the gesture's code is not loaded

#### Scenario: Reduced motion
- **WHEN** a person who asked for reduced motion pulls a list down
- **THEN** the mark appears in one place without following the finger, and the sync runs on release as usual

### Requirement: A page header follows its own width
From 768 px, where a page shows its own header, the header SHALL be laid out by the width of the column it sits in, not by the window's. A header narrower than 40 rem on a touch screen, or narrower than 28 rem with a mouse, is a narrow header: a 768 px window with the sidebar open, and a list beside the docked task panel. A narrow header SHALL follow the phone bar's rules in its own row:

- On a page with a menu (the overflow menu or the page's own menu) Help SHALL be the last item of that menu, after a separator, opening the same guide section and returning focus to the menu's button; the row SHALL show no Help button. A page without a menu SHALL keep the button.
- A list SHALL show Process the Inbox or Ask, the chip of an active filter and its display options in the row; Select tasks, the duration filter's choices, Display mode, and on a project its Layout, Share and Add a note SHALL be items of the page's menu, reachable by tap and with the menu's keyboard model.
- The title SHALL give way, down to 6 rem, before the actions wrap under it, and a cut title SHALL keep its full text reachable as it does at other widths.
- A task's page SHALL show only the nearest step up of its path, as a back arrow followed by the step's name; the task's title SHALL NOT be repeated in the path. The name SHALL show whole or not at all: while it does not fit, the arrow alone leads back and its accessible name is the step's name.
- Statistics SHALL be one row: the title, the period as one menu button showing the chosen period, and the menu holding Export time entries.

A header of 40 rem or more on a touch screen, or of 28 rem or more with a mouse, SHALL keep its actions, its Help button and its full path as before. This is presentation only: it reads and writes no data, sends nothing and behaves the same offline; there is nothing to converge.

#### Scenario: Inbox on a tablet beside the sidebar
- **WHEN** the Inbox is open in a 768 px window on a touch screen with the sidebar open
- **THEN** the header is one row with the title, "3 to sort" in full, Process, Display options and the Inbox menu, and no Help button

#### Scenario: Moved actions by tap
- **WHEN** the user taps the Inbox menu in that header
- **THEN** the menu lists Select tasks and the duration filter's choices, and Help is its last item

#### Scenario: Help by keyboard
- **WHEN** the user focuses the menu's button in that header, presses Enter, then End, then Enter
- **THEN** focus is on Help after End, the guide's section for the Inbox opens, and closing it puts focus on the menu's button

#### Scenario: A task's page
- **WHEN** a task of the Inbox is open as its page in a 768 px window on a touch screen with the sidebar open
- **THEN** the header is one row: a back arrow with "Inbox", the position, Next task, Previous task, Close and the task's menu; the task's title is the page's heading below and not in the path

#### Scenario: A step whose name does not fit
- **WHEN** the nearest step up is a parent task with a name longer than the row has room for
- **THEN** the row shows the back arrow without text, and the arrow's accessible name is the parent's name

#### Scenario: Statistics
- **WHEN** Statistics is open in a 768 px window on a touch screen with the sidebar open
- **THEN** the header is one row with "Statistics", a button reading "This week" that opens the five periods, and the menu with Export time entries

#### Scenario: A project with a long name
- **WHEN** a project named "Home renovation with a rather long project name" is open as a board in a 768 px window on a touch screen with the sidebar open
- **THEN** the header is one row with the name and the project menu; Layout, Share, Select tasks, the filter, Add a note and Help are in the menu

#### Scenario: A list beside the docked panel
- **WHEN** the Inbox is open in a 1024 px window on a touch screen and a task is open in the panel beside it
- **THEN** the Inbox header shows Process, Display options and the Inbox menu, and Help is in that menu

#### Scenario: The sidebar collapsed
- **WHEN** the Inbox is open in a 768 px window on a touch screen with the sidebar collapsed to icons
- **THEN** the header shows Process, Select, Filter, Display options, the Inbox menu and the Help button, as before

#### Scenario: A mouse at 1280 px
- **WHEN** the Inbox is open in a 1280 px window with a mouse, with or without a task in the panel beside it
- **THEN** the header shows the same controls as before, ending with the Help button, and the Inbox menu has no Help item

### Requirement: A lead line shows whole or not at all
The lead line beside a compact header's title SHALL take the room the title and the actions leave, and SHALL be shown whole or not shown: it SHALL NOT be cut with an ellipsis. While hidden it SHALL NOT be announced or focusable. A lead line holding a control that is offered nowhere else (the calendar's Re-plan) SHALL keep its width and SHALL NOT be hidden. In a narrow header a project's lead line SHALL be the plain text the phone bar shows (progress, members and role, read-only, maintenance, public), with members and public links opened from Share in the project menu. The lead line of a day page (Today, Upcoming) wraps as before. This is presentation only and behaves the same offline.

#### Scenario: Room for the lead line
- **WHEN** the Inbox with three tasks to sort is open in a header with room beside the title
- **THEN** "3 to sort" shows in full

#### Scenario: No room for the lead line
- **WHEN** a project's header has less room beside the name than its lead line needs
- **THEN** the lead line is not shown, nothing in the header ends with an ellipsis except the name, and the header stays one row

#### Scenario: A lead line with a control
- **WHEN** the calendar's header shows "2 blocks behind · Re-plan"
- **THEN** the lead line keeps its width at every header width and Re-plan can be pressed

### Requirement: Tab height on a touch screen
The tab bar's tabs SHALL be 56 px tall with a touch screen as the main pointer, as with a mouse, so the bar fills the 56 px the shell reserves for it under the content and the add button keeps its distance from it. The rule that gives every button on a touch screen a 44 px minimum SHALL NOT make a tab shorter than that. While the bar is minimised a tab SHALL be at least 44 px tall on a touch screen. The cold-start skeleton's tab bar SHALL have the same height as the real one. The layout check SHALL fail on any screen whose tab bar, not minimised, has a tab under 48 px tall. This is presentation only and the same offline.

#### Scenario: The tab bar on a phone
- **WHEN** the Inbox is open at 360 px on a touch screen
- **THEN** each of the four tabs is 56 px tall and the bar's top edge is where the content's reserved room ends

#### Scenario: The skeleton does not move
- **WHEN** the app starts cold on a phone that was signed in
- **THEN** the skeleton's tab bar is as tall as the tab bar that replaces it

#### Scenario: A short tab fails the check
- **WHEN** a tab of the tab bar is 44 px tall on a screen of the layout check
- **THEN** the check fails naming the screen and the tab

### Requirement: Sidebar rows on touch give the name the room
On a coarse pointer a sidebar row that has a menu (a project, a label, a saved view, a favourite, a pinned note) SHALL NOT paint its menu button and SHALL NOT keep room for it: the row's name takes the width up to the row's marks and count, which stay. Holding the row still for the touch hold time SHALL tint it, and releasing SHALL open the row's menu, the same menu the button opens, and SHALL NOT open the row; moving the finger before the hold SHALL scroll the list and open nothing, and on a row that can be dragged a move after the hold SHALL drag it as before. A tap SHALL open the row as before. The menu button SHALL remain in the Tab order and in the accessibility tree with its name ("Menu for project Home renovation") at the end of its row: while it has keyboard focus it SHALL show there, over the count, at least 44 by 44 CSS pixels, and Enter or Space SHALL open the menu; while it is not shown it SHALL take no taps. A group heading's own menu and the rows of the Labels and Views pages are not affected. With a fine pointer nothing SHALL change: the button shows on hover and focus as before. Nothing here changes what the menu's items do or write, so it is the same offline.

#### Scenario: A long project name on a tablet
- **WHEN** the project "Home renovation with a rather long project name", shared and with 7 open tasks, is shown in the 256 px sidebar at 768 px on a touch screen
- **THEN** its row shows no menu button, its name runs up to the members mark and the count, and at least six more characters of the name show than with the button

#### Scenario: Hold opens the menu
- **WHEN** the user holds a project's row in the phone drawer until it tints, and lifts the finger
- **THEN** the project's menu opens, the project is not opened and the drawer stays open

#### Scenario: Tap and scroll
- **WHEN** the user taps a project's row, and on another visit drags a finger over the rows
- **THEN** the tap opens the project and the drag scrolls the list, and neither opens a menu

#### Scenario: Keyboard on a touch device
- **WHEN** a user with a keyboard attached to a tablet presses Tab on a project's row
- **THEN** the row's menu button shows at the end of the row with the focus ring, and Enter opens the menu

#### Scenario: Screen reader on touch
- **WHEN** a screen reader user on a phone moves past a project's row in the drawer
- **THEN** the next item is the button "Menu for project", named after the project, and activating it opens the menu

#### Scenario: Mouse
- **WHEN** the same sidebar is shown at 1280 px with a mouse
- **THEN** every row looks and behaves as before: the menu button appears on hover and on focus

### Requirement: Sidebar footer on touch shows whole words
On a coarse pointer the account control in the sidebar footer SHALL show the person's name only where the whole name fits beside the avatar; where it does not, the control SHALL show the avatar alone, never part of the name with an ellipsis. The sync state SHALL always show its dot. While a sync runs the dot SHALL be the only sign, so the footer does not change with every sync; the words of the other states that show words ("Offline · 2 pending", "3 pending", "Locked") SHALL show only where they fit whole, and SHALL take their room before the name. The account control SHALL keep the person's name as its accessible name and the sync control its state as its accessible name, whatever is shown. Every control of the footer SHALL keep a target of at least 44 by 44 CSS pixels, none SHALL overlap another, and the row SHALL NOT be wider than the sidebar. A sync error SHALL keep its words and its detail as before. With a fine pointer the footer SHALL NOT change.

#### Scenario: Tablet sidebar
- **WHEN** Ada Lovelace's sidebar is 256 px wide on a touch screen, with the assistant launcher and notifications in the footer
- **THEN** the account control shows her avatar alone and is named "Ada Lovelace"

#### Scenario: Phone drawer
- **WHEN** the same account opens the drawer on a 360 px wide phone
- **THEN** the footer reads "Ada Lovelace" whole beside the avatar

#### Scenario: A sync runs
- **WHEN** a sync starts and ends while the drawer is open on a 360 px wide phone
- **THEN** the dot pulses and turns green again, the name stays "Ada Lovelace" throughout, and no words appear beside the dot

#### Scenario: Offline on a tablet
- **WHEN** the device goes offline with nothing pending and the sidebar is 256 px wide on a touch screen
- **THEN** the footer reads "Offline" whole beside the grey dot

#### Scenario: Words that do not fit
- **WHEN** the sync state's words are wider than the room left beside the footer's other controls
- **THEN** only the dot shows, the row is no wider than the sidebar, and the control's accessible name still carries the words

### Requirement: The cold-start skeleton holds the phone's chrome
Below 768 px, while the app does not yet know the account, the loading skeleton SHALL show the shell's top bar and the bottom tab bar as empty shapes in the places and sizes the shell gives them, including the top and bottom safe areas, so that nothing moves when the shell replaces the skeleton. The shapes SHALL take their frame from the same definition as the real bar and tab bar. A day page's bar (Today, Upcoming) SHALL have no hairline in the skeleton, as it has none in the shell. The shapes SHALL show only where the shell will show them: on a device that was signed in, and not on a screen without the tab bar (a task page, the routine editor, the capture screen, an invitation or a reset link). They SHALL carry no text and no name for assistive technology; the skeleton's rows keep the one loading status. From 768 px the skeleton is unchanged. This is presentation only: it reads no task data and is the same offline.

#### Scenario: Cold start on a phone
- **WHEN** a signed-in user opens the Inbox at 360 px and the account is not yet known
- **THEN** the skeleton shows a bar at the top and a tab bar with four tab shapes at the bottom, and when the app appears the bar, its menu button and every tab are at the same position and size

#### Scenario: A phone with safe areas
- **WHEN** the same start happens on a phone with a 59 px top inset and a 34 px bottom inset
- **THEN** the skeleton's bar starts below the top inset and its tab bar ends above the bottom inset, exactly as the shell's do

#### Scenario: Today
- **WHEN** the app starts on Today at 360 px
- **THEN** the skeleton's bar has no hairline, and its height is the height of Today's bar

#### Scenario: A device that was never signed in
- **WHEN** the app opens at 360 px in a browser that holds no account
- **THEN** the skeleton shows rows only, and the sign-in screen follows

#### Scenario: A screen without the tab bar
- **WHEN** the app starts on the capture screen or a task page at 360 px
- **THEN** the skeleton shows rows only

#### Scenario: A wide window
- **WHEN** the app starts at 1280 px
- **THEN** the skeleton shows rows and no bar or tab bar

### Requirement: Add task in the sidebar
From 768 px, the sidebar SHALL show an "Add task" item in the Tasks space, under the workspace row and the space switch and above the primary destinations, in the row's quiet tone with the phone add button's mark (a plus on the accent). With "Show shortcut hints" on, it SHALL print the quick add key (`q`) at its end; its tooltip SHALL name the key in every case, and it SHALL be a button named "Add task" that announces the key. In the icon rail it SHALL show the mark alone, its name in the tooltip. Activating it SHALL do exactly what the quick add key does on that screen outside a text field: on a list screen with a quick add, focus that quick add, whose task takes the view's defaults (the project of a project, today in Today, tomorrow in Upcoming, the label of a label, the location of a location, parked in Someday, assigned to the user in Assigned to me); elsewhere, open the command bar in Add mode, which takes the defaults of "Add mode". It SHALL NOT be shown in the phone drawer, where the add button is, nor in the Notes space. The phone's floating add button SHALL carry the same name, "Add task". Adding works offline through the same local operation as every quick add.

#### Scenario: Today
- **WHEN** the user is in Today and clicks Add task
- **THEN** the list's quick add has focus, and a task typed there and added is due today

#### Scenario: A project
- **WHEN** the user is in the project Work and clicks Add task, types `Draft agenda` and presses Enter
- **THEN** the task is added to Work

#### Scenario: A screen without a quick add
- **WHEN** the user is in Trash and clicks Add task
- **THEN** the command bar opens in Add mode with its field focused, and a task added there goes to the Inbox

#### Scenario: Keyboard
- **WHEN** the user tabs to Add task and presses Enter
- **THEN** the same happens as on a click, and the button is announced as "Add task" with the key `q`

#### Scenario: Phone
- **WHEN** the screen is narrower than 768 px and the user opens the menu
- **THEN** the drawer has no Add task item and the floating add button, named "Add task", stays the way to add
