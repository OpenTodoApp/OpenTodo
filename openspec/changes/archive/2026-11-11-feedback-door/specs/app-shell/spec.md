## MODIFIED Requirements

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
