## MODIFIED Requirements

### Requirement: Sidebar structure
The sidebar SHALL show, top to bottom: the workspace control (the current workspace's icon or colour and name, opening the workspace switcher; the app name is shown beside it only while the account has one workspace) with a search button beside it (search and commands), the primary destinations Inbox, Today, Upcoming, Calendar (Day or Week, as last used) pinned at the top; then, in one scroller, a "More" group collapsed by default (Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Ask when available), the Favourites group when the user has pinned anything in the current workspace, then Projects, Labels and Filters, each collapsible with its state remembered on the device and its item count on the header while collapsed; then one pinned footer row holding the account (avatar and name, opening the account menu), the assistant launcher when the assistant is available, notifications and the sync status. Every group, row and count SHALL be those of the current workspace. On a device that has not stored a state for a group, Projects SHALL start open and Labels and Filters SHALL start closed. From 768 px with a fine pointer, More SHALL instead be a row after the primary destinations that opens a menu of those destinations, carrying the same marker on the row. The Filters group SHALL be shown only once the user has a saved filter in the current workspace and the Labels group only once the user has a label there; an empty group shows nothing, not a placeholder sentence.

Counts SHALL be visible at all times on Inbox, Today and collapsed group headers only. A project's count SHALL be visible while its row is hovered or focused, and at all times on a coarse pointer; favourites follow the rule of their own kind. Filter rows and label rows SHALL show no count. Every row that has a count SHALL carry it in its accessible name. The unread badges of shared projects and of Updates are governed by `activity-feed` and are unchanged. The workspace control SHALL carry one accent dot while another workspace has unread updates, with the workspace names in its tooltip and accessible name.

The primary destinations and the More group SHALL depend on the user's "How you work" preference:

| Preference | Primary destinations | More group |
| --- | --- | --- |
| `lists` and `companion` | Inbox, Today, Upcoming, Calendar (Day or Week, as last used) | Loop home, Next, Waiting, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Review, Statistics, Ask when available |
| `first` | Loop home, Inbox, Today, Next, Waiting, Review | Upcoming, Calendar, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Statistics, Ask when available |

In `first` mode the primary destinations SHALL never exceed six. Promoted destinations SHALL be listed in the More group, and the stored promotion list SHALL be kept unchanged. The workspace control is not a destination and SHALL not count against the six.

#### Scenario: Default sidebar
- **WHEN** a user with projects, labels, saved filters and no favourites opens the app on a 1280×800 screen on a device that never stored a group state
- **THEN** the workspace control, five primary destinations and the More group are visible above Projects (open), Labels (closed, "Labels 3") and Filters (closed, "Filters 2"), no Favourites group is shown, the footer is one row that is visible without scrolling, and only the middle part scrolls when the project tree is long

#### Scenario: One workspace
- **WHEN** an account that never created a workspace opens the app
- **THEN** the control reads "OpenTodo · Personal" and opens the switcher with the one workspace, "New workspace" and "Manage workspaces"

#### Scenario: Groups follow the workspace
- **WHEN** the user switches from "Personal" (4 projects, 2 labels, 1 filter) to "Work" (6 projects, no labels, no filters)
- **THEN** the Projects group lists Work's six projects, no Labels or Filters group is shown, the Favourites group shows Work's pinned items or nothing, and Inbox and Today show Work's counts

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
- **THEN** the drawer's scroller, which holds More and the groups below it, scrolls and reaches the last project, the workspace control, the primary destinations and the footer stay in place, and the page behind the drawer does not move

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
- **THEN** the primary destinations are Loop home, Inbox, Today, Next, Waiting and Review in that order, Upcoming and Calendar are in the More group, the workspace control sits above them without counting as a seventh, and the Review entry carries its rhythm marker as a dot

#### Scenario: Promotions kept across modes
- **WHEN** a user who promoted Someday switches to Open Loops first and later back to Companion
- **THEN** Someday is in the More group while in Open Loops first, and is a primary destination again after switching back, on every device after sync

#### Scenario: Unread in another workspace
- **WHEN** the user is in "Personal" and a shared project in "Work" receives activity the user has not seen
- **THEN** the workspace control shows one accent dot, its tooltip reads "Updates in Work", and the dot leaves once the user has seen the updates
