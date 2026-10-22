## ADDED Requirements

### Requirement: Sidebar header row
The top of the sidebar SHALL be one header row holding the brand mark and the wordmark "OpenTodo" on the left and the search and commands button on the right. The header row SHALL be a slot whose left part can be replaced by another control (the workspace control of `workspaces`) while the search button and everything below the row stay unchanged. On the icon rail the row SHALL show the mark alone, centred, with "OpenTodo" as its tooltip and accessible name. The mark SHALL be the mono variant of the brand mark, so it follows the sidebar's text tone in both themes, and the wordmark SHALL be set in the interface typeface at the body size with the strong text tone. The header row SHALL be rendered from local data only and SHALL look the same offline.

#### Scenario: Header at rest
- **WHEN** a user opens the app on a 1280×800 screen in light and in dark
- **THEN** the sidebar starts with the brand mark at 24 px, the wordmark "OpenTodo" and the search button in one row of 40 px or less, the mark is drawn in the current text tone with the accent on its loop, and no tick-in-a-square image is anywhere in the sidebar

#### Scenario: Icon rail
- **WHEN** the user collapses the sidebar with `[`
- **THEN** the header row shows the mark alone at 24 px, hovering or focusing it reads "OpenTodo", and the search button moves to the footer as before

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
