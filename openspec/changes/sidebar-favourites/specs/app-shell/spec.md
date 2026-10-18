# Spec Delta

## MODIFIED Requirements

### Requirement: Sidebar structure
The sidebar SHALL show, top to bottom: the app name with a search button beside it (search and commands), the primary destinations Inbox, Today, Upcoming, Calendar (Day or Week, as last used) pinned at the top; then, in one scroller, a "More" group collapsed by default (Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Ask when available), the Favourites group when the user has pinned anything, then Projects, Labels and Filters, each collapsible with its state remembered on the device (Labels and Filters closed until the device stores a state) and its item count on the header while collapsed; then a pinned footer with Help, notifications, sync status and the account. From 768 px with a fine pointer, More SHALL instead be a row after the primary destinations that opens a menu of those destinations, carrying the same badge on the row. The Filters group SHALL be shown only once the user has a saved filter and the Labels group only once the user has a label; an empty group shows nothing, not a placeholder sentence. Counts SHALL appear on Inbox, Today, projects, favourites and collapsed group headers only.

The primary destinations and the More group SHALL depend on the user's "How you work" preference:

| Preference | Primary destinations | More group |
| --- | --- | --- |
| `lists` and `companion` | Inbox, Today, Upcoming, Calendar (Day or Week, as last used) | Loop home, Next, Waiting, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Review, Statistics, Ask when available |
| `first` | Loop home, Inbox, Today, Next, Waiting, Review | Upcoming, Calendar, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Statistics, Ask when available |

In `first` mode the primary destinations SHALL never exceed six. Promoted destinations SHALL be listed in the More group, and the stored promotion list SHALL be kept unchanged.

#### Scenario: Default sidebar
- **WHEN** a user with projects and labels and no favourites opens the app on a 1280×800 screen
- **THEN** five primary destinations and the More group are visible above Projects, Labels and Filters, no Favourites group is shown, the footer is visible without scrolling, and only the middle part scrolls when the project tree is long

#### Scenario: Labels are reachable
- **WHEN** the user has forty projects and three labels
- **THEN** scrolling the middle part of the sidebar reaches the Labels group, and nothing inside it scrolls separately

#### Scenario: Promote a destination
- **WHEN** the user turns on "Show in sidebar" for Someday in Settings → Appearance
- **THEN** Someday appears among the primary destinations on every device of that user after sync, and leaves the More group

#### Scenario: Collapse a group
- **WHEN** the user has six saved filters and collapses the Filters group, then reloads the app on the same device
- **THEN** the Filters header reads "Filters 6" with no rows under it, and on the user's other devices the Filters group keeps its own state

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

#### Scenario: Favourites first
- **WHEN** the user has pinned a project, a label and a saved filter
- **THEN** the Favourites group is the first group of the scroller, above Projects, and the Labels and Filters groups are collapsed on a device that never stored a group state

#### Scenario: Open Loops first sidebar
- **WHEN** a user picks Open Loops first and opens the app on a 1280×800 screen
- **THEN** the primary destinations are Loop home, Inbox, Today, Next, Waiting and Review in that order, Upcoming and Calendar are in the More group, and the Review entry carries its rhythm markers

#### Scenario: Promotions kept across modes
- **WHEN** a user who promoted Someday switches to Open Loops first and later back to Companion
- **THEN** Someday is in the More group while in Open Loops first, and is a primary destination again after switching back, on every device after sync

## ADDED Requirements

### Requirement: Favourites group
The Favourites group SHALL list the user's pinned projects, labels and saved filters in the user's order, each with the icon or colour and the live open-task count its own group shows, opening the same destination. Items SHALL be reorderable from their menus and by keyboard, and unpinnable from their menus. The group SHALL reflect pins, order and renames from the user's other devices after sync, and SHALL render from local data so it is correct offline.

#### Scenario: Mixed kinds in order
- **WHEN** the user pins "Website launch" (project, 5 open), "Deep work" (filter, 4 matches) and "errand" (label, 3 open) and moves "Deep work" to the top
- **THEN** the group reads "Deep work 4", "Website launch 5", "errand 3" on this device now and on other devices after sync, and each row opens its view

#### Scenario: Pinned item removed
- **WHEN** a pinned project is archived or deleted on another device and this device syncs
- **THEN** it leaves the Favourites group without a reload and reappears if it is restored

#### Scenario: Pinned offline
- **WHEN** the device is offline and the user pins a label
- **THEN** it appears in Favourites at once, survives a reload, and reaches the user's other devices when the network returns
