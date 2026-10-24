## MODIFIED Requirements

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

### Requirement: Phone navigation
Below 768 px the shell SHALL show a bottom tab bar with Inbox, Today, Upcoming and Search (the phone drawer opens from the bar's menu button, see "Phone drawer"), marking the current tab in the strong text tone rather than the accent, and a floating add button at the bottom right above the bar that opens quick add as a bottom sheet with the keyboard up. The bar and the button SHALL hide while a sheet is open and on the task page, which has its own bar with Back and the next and previous task. Tabs SHALL be at least 48 px tall and SHALL respect the bottom safe area. Every list SHALL reserve the add button's footprint under its last row, so the button never covers a row or its metadata. While the content scrolls down by more than 24 px the bar SHALL minimise to its icons and the button SHALL slide out below it; on any scroll up, at the end of the content, or 600 ms after scrolling stops, both SHALL return. When the system requests reduced motion the bar and the button SHALL stay in place at all times. This is presentation only; every action behind the bar and the button is the same local operation offline.

#### Scenario: Two taps to any primary view
- **WHEN** the user is in a project on a phone and taps Today in the bar
- **THEN** Today opens without the drawer

#### Scenario: Four tabs
- **WHEN** the Inbox is open on a 390 px phone
- **THEN** the tab bar shows Inbox, Today, Upcoming and Search in that order, Inbox is marked current in the strong text tone, and no tab is in the accent colour

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

### Requirement: Phone drawer
Below 768 px, the menu button at the start of the shell's bar SHALL open a drawer from the left edge, at most 85 percent of the viewport width and at most 20 rem, over a scrim that closes it on tap. The drawer SHALL NOT repeat the tab bar's destinations. It SHALL show, top to bottom, in one scroller: the find field, the primary destinations the tab bar does not hold (Calendar in Lists and Companion; Loop home, Next, Waiting and Review in Open Loops first), the More group, then Favourites, Projects, Labels and Filters as rows at least 48 px tall following the sidebar's counts and grouping rules; then a pinned footer with the account row (opening Settings, Help, Keyboard shortcuts and Sign out), the assistant launcher when the assistant is available, notifications and the sync status. Choosing a destination SHALL close the drawer. The drawer SHALL use the sidebar's tones. The page behind the drawer SHALL NOT scroll while it is open.

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
