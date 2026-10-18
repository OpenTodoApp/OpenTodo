# Spec Delta

## MODIFIED Requirements

### Requirement: Sidebar structure
The sidebar SHALL show, top to bottom: the app name, the primary destinations Inbox, Today, Upcoming, Calendar (Day or Week, as last used) and a "More" group collapsed by default (Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Ask when available); then the Filters, Projects and Labels groups in one scroller, each collapsible with its state remembered on the device and its item count on the header while collapsed; then a pinned footer with Help, search, notifications, sync status and the account. Counts SHALL appear on Inbox, Today, projects and collapsed group headers only.

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

## ADDED Requirements

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
