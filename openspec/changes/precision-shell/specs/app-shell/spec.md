## MODIFIED Requirements

### Requirement: Page template
Every view SHALL render a page header and, below it, its content, inside one inset content surface (precision-shell D1). There SHALL be two page heads:

- A **day page** (Today and Upcoming) SHALL have a top row with the sidebar toggle on the left and the page's actions on the right, then the title at the display step with its lead line (the date and the day's totals) beside it at the prose step, in the muted tone, then an optional briefing at the prose step: one or two sentences about the day.
- Every other page SHALL have a **compact header**, one 46 px row: the sidebar toggle, then the title at the header title step (a colour dot or icon, or a breadcrumb, before it), then the lead line (the page's meta: totals, members and role, a count, a read-only note) in the muted tone at the metadata size beside the title, then at most two visible actions, an overflow menu for the rest and the Help action at the right.

A second header row MAY hold the page's view tabs or filter chips on the left and its view tools (filter, display, panel) on the right. The header SHALL stay visible while the content scrolls. Content SHALL use the full width of the content surface, with the same side padding on every page, so every page's title and first row start at the same horizontal position; a settings or form page keeps its fields at 42 rem from that left edge. A board or a timeline scrolls sideways inside the surface rather than widening it, and switching a project between list, board and timeline SHALL not move its title or actions.

Below 768 px the shell's bar SHALL carry the title and show the lead line as its subtitle on one line, cut at the bar's edge, so a lead line that arrives with the data does not grow the bar; on a project the subtitle is plain text, and members and public links open from Share.

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
- **WHEN** Today is open on a 390 px screen
- **THEN** the shell's bar shows "Today" with the date line under it as its subtitle, and the page header row shows no second title

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

### Requirement: Resizable sidebar
From 1024 px the sidebar SHALL be resizable by dragging its edge between 15 rem and 22.5 rem, remembered per device, and SHALL be collapsible to icons with the sidebar toggle in the page header (and, on the collapsed rail, an Expand control in its footer) and the shortcut `[`.

#### Scenario: Collapse to icons
- **WHEN** the user presses `[` outside a text field on a desktop
- **THEN** the sidebar shows only icons with their names as tooltips, and the content column widens

### Requirement: Compact sidebar on a desktop
From 768 px the sidebar footer SHALL be one row: the account control (the person's avatar and name, truncated when the row is narrow) that opens the account menu, then, as icon buttons each with its name as tooltip and accessible name, the assistant launcher when the assistant is available, notifications, the sync dot and, while the sidebar is the collapsed rail, an Expand control (the page header's sidebar toggle collapses it). The account menu SHALL offer Settings, Help and Keyboard shortcuts, each with its registered shortcut shown, and after a separator Sign out, which opens the same confirmation as Settings → Account. Below 768 px the footer SHALL be the same row with touch-height targets. With a fine pointer, sidebar rows SHALL be 32 px high and group headings tighter; with a coarse pointer rows keep their touch height. The sidebar's scroller SHALL have a thin scrollbar in the theme's border colour, stronger while the pointer or focus is inside it, and SHALL fade its top or bottom edge only while content is hidden past that edge, leaving the scrollbar itself unfaded.

#### Scenario: Short desktop window
- **WHEN** a user with twelve projects opens the app in a 1280×600 window with a mouse
- **THEN** at least eight projects are visible in the sidebar without scrolling, the footer takes one row, and the bottom edge of the scroller fades while projects are hidden below it

#### Scenario: Footer names
- **WHEN** a screen reader user moves through the footer row on a desktop
- **THEN** each control announces its name (the person's name as the account menu button, Notifications with its unread count, the sync status), and the account menu's items announce Settings, Help, Keyboard shortcuts and Sign out with their shortcuts as descriptions

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
- **THEN** the account menu opens with the person's name as its name and Settings, Help, Keyboard shortcuts and Sign out as before

#### Scenario: Stopped elsewhere
- **WHEN** the entry is stopped on another device and this device syncs
- **THEN** the pill disappears and the account name returns without a reload

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

## ADDED Requirements

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
