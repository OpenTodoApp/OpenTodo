## MODIFIED Requirements

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

### Requirement: Panel width and expansion
From 1024 px the panel SHALL be a 26 rem column, 30 rem from 1440 px, and SHALL offer an Expand action that opens the task as a full page at `/task/<id>` with the same content and a Back action. Between 768 and 1023 px it SHALL be a sheet of at most 28 rem over the content column; below 768 px it SHALL open as a bottom sheet over the dimmed list, at most 90 percent of the viewport height, with a drag handle above its sticky header (see `web-app` "Task detail panel").

#### Scenario: Expand a long note
- **WHEN** the user activates Expand on an open task
- **THEN** the task fills the content column, the address is `/task/<id>`, and Back returns to the list with the panel open

#### Scenario: The list stays in sight on a phone
- **WHEN** the user opens a task from Today on a 390×844 phone
- **THEN** the task opens as a bottom sheet with a drag handle, the top of Today stays visible and dimmed above it, and the sheet is no taller than 90 percent of the screen

## ADDED Requirements

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
