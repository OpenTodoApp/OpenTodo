## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Workspace control on two lines
**Reason**: The instance's name moves from the workspace control to the brand line in the sidebar footer, so the control always shows one line: the workspace's picture and name.
**Migration**: None for data. The control's accessible name becomes "Workspace: <name>", and the instance's name is read from the brand line.
