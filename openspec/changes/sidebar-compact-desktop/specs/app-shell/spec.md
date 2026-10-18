# Spec Delta

## ADDED Requirements

### Requirement: Compact sidebar on a desktop
From 768 px the sidebar footer SHALL put Help, notifications, the assistant, keyboard shortcuts, the sync dot and the collapse control in one row of icon buttons, each with its name as tooltip and accessible name, above the account row; below 768 px Help SHALL stay a full-width row. With a fine pointer, sidebar rows SHALL be 32 px high and group headings tighter; with a coarse pointer rows keep their touch height. The sidebar's scroller SHALL have a thin scrollbar in the theme's border colour, stronger while the pointer or focus is inside it, and SHALL fade its top or bottom edge only while content is hidden past that edge, leaving the scrollbar itself unfaded.

#### Scenario: Short desktop window
- **WHEN** a user with twelve projects opens the app in a 1280×600 window with a mouse
- **THEN** at least seven projects are visible in the sidebar without scrolling, the footer takes two rows (icons, account), and the bottom edge of the scroller fades while projects are hidden below it

#### Scenario: Footer names
- **WHEN** a screen reader user moves through the footer row on a desktop
- **THEN** each control announces its name (Help, Notifications, Keyboard shortcuts, the sync status, Collapse sidebar), and Help is marked current on the Help page

#### Scenario: Touch keeps its targets
- **WHEN** the sidebar is shown on a 768 px touch screen
- **THEN** More is the inline group, rows keep their touch height, and every control in the sidebar is at least 44 × 44 px

## MODIFIED Requirements

### Requirement: Sidebar structure
The sidebar SHALL show, top to bottom: the app name with a search button beside it (search and commands), the primary destinations Inbox, Today, Upcoming, Calendar (Day or Week, as last used) pinned at the top; then, in one scroller, a "More" group collapsed by default (Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Ask when available) and the Filters, Projects and Labels groups, each collapsible with its state remembered on the device and its item count on the header while collapsed; then a pinned footer with Help, notifications, sync status and the account. From 768 px with a fine pointer, More SHALL instead be a row after the primary destinations that opens a menu of those destinations, carrying the same badge on the row. The Filters group SHALL be shown only once the user has a saved filter and the Labels group only once the user has a label; an empty group shows nothing, not a placeholder sentence. Counts SHALL appear on Inbox, Today, projects and collapsed group headers only.

#### Scenario: Default sidebar
- **WHEN** a user with projects and labels opens the app on a 1280×800 screen
- **THEN** five primary destinations and the More group are visible above Filters, Projects and Labels, the footer is visible without scrolling, and only the middle part scrolls when the project tree is long

#### Scenario: Labels are reachable
- **WHEN** the user has forty projects and three labels
- **THEN** scrolling the middle part of the sidebar reaches the Labels group, and nothing inside it scrolls separately

#### Scenario: Promote a destination
- **WHEN** the user turns on "Show in sidebar" for Someday in Settings → Appearance
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

#### Scenario: More on a desktop
- **WHEN** a user on a 1280×600 screen with a mouse selects More
- **THEN** a menu lists the More destinations below the row, the projects keep their place in the scroller, choosing Someday opens it and closes the menu, and the More row is marked current while Someday is open

#### Scenario: No empty groups
- **WHEN** a new account with no saved filter and no label opens the app
- **THEN** the sidebar shows no Filters or Labels group and no placeholder sentence, and saving a first filter brings the Filters group back with its All action

### Requirement: No desktop top bar
From 768 px wide the shell SHALL have no bar above the content column; search SHALL be a button beside the app name in the sidebar, notifications, sync status and help SHALL live in the sidebar footer, and page actions in the page header. Below 768 px a bar SHALL show the menu button, the page title and up to two page actions, with the remaining actions in an overflow menu.

#### Scenario: Desktop height for content
- **WHEN** the Inbox is open on a 1280×800 screen
- **THEN** the first task is visible within the top 160 px of the content column

#### Scenario: Phone bar
- **WHEN** a project is open on a 390 px screen
- **THEN** the bar shows the menu button, the project name and the List/Board control, and Share is in the overflow menu
