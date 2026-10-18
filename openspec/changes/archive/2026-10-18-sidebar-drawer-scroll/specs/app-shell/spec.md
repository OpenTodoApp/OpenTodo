# Spec Delta

## MODIFIED Requirements

### Requirement: Sidebar structure
The sidebar SHALL show, top to bottom: the app name, the primary destinations Inbox, Today, Upcoming, Calendar (Day or Week, as last used) pinned at the top; then, in one scroller, a "More" group collapsed by default (Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Ask when available) and the Filters, Projects and Labels groups, each collapsible with its state remembered on the device and its item count on the header while collapsed; then a pinned footer with Help, search, notifications, sync status and the account. Counts SHALL appear on Inbox, Today, projects and collapsed group headers only.

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
