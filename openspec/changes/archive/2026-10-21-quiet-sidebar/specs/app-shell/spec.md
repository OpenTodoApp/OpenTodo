# Spec Delta

## MODIFIED Requirements

### Requirement: Sidebar structure
The sidebar SHALL show, top to bottom: the app name with a search button beside it (search and commands), the primary destinations Inbox, Today, Upcoming, Calendar (Day or Week, as last used) pinned at the top; then, in one scroller, a "More" group collapsed by default (Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Ask when available), the Favourites group when the user has pinned anything, then Projects, Labels and Filters, each collapsible with its state remembered on the device and its item count on the header while collapsed; then one pinned footer row holding the account (avatar and name, opening the account menu), the assistant launcher when the assistant is available, notifications and the sync status. On a device that has not stored a state for a group, Projects SHALL start open and Labels and Filters SHALL start closed. From 768 px with a fine pointer, More SHALL instead be a row after the primary destinations that opens a menu of those destinations, carrying the same marker on the row. The Filters group SHALL be shown only once the user has a saved filter and the Labels group only once the user has a label; an empty group shows nothing, not a placeholder sentence.

Counts SHALL be visible at all times on Inbox, Today and collapsed group headers only. A project's count SHALL be visible while its row is hovered or focused, and at all times on a coarse pointer; favourites follow the rule of their own kind. Filter rows and label rows SHALL show no count. Every row that has a count SHALL carry it in its accessible name. The unread badges of shared projects and of Updates are governed by `activity-feed` and are unchanged.

The primary destinations and the More group SHALL depend on the user's "How you work" preference:

| Preference | Primary destinations | More group |
| --- | --- | --- |
| `lists` and `companion` | Inbox, Today, Upcoming, Calendar (Day or Week, as last used) | Loop home, Next, Waiting, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Review, Statistics, Ask when available |
| `first` | Loop home, Inbox, Today, Next, Waiting, Review | Upcoming, Calendar, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Statistics, Ask when available |

In `first` mode the primary destinations SHALL never exceed six. Promoted destinations SHALL be listed in the More group, and the stored promotion list SHALL be kept unchanged.

#### Scenario: Default sidebar
- **WHEN** a user with projects, labels, saved filters and no favourites opens the app on a 1280×800 screen on a device that never stored a group state
- **THEN** five primary destinations and the More group are visible above Projects (open), Labels (closed, "Labels 3") and Filters (closed, "Filters 2"), no Favourites group is shown, the footer is one row that is visible without scrolling, and only the middle part scrolls when the project tree is long

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
- **THEN** the drawer's scroller, which holds More and the groups below it, scrolls and reaches the last project, the primary destinations and the footer stay in place, and the page behind the drawer does not move

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
- **THEN** the primary destinations are Loop home, Inbox, Today, Next, Waiting and Review in that order, Upcoming and Calendar are in the More group, and the Review entry carries its rhythm marker as a dot

#### Scenario: Promotions kept across modes
- **WHEN** a user who promoted Someday switches to Open Loops first and later back to Companion
- **THEN** Someday is in the More group while in Open Loops first, and is a primary destination again after switching back, on every device after sync

### Requirement: Compact sidebar on a desktop
From 768 px the sidebar footer SHALL be one row: the account control (the person's avatar and name, truncated when the row is narrow) that opens the account menu, then, as icon buttons each with its name as tooltip and accessible name, the assistant launcher when the assistant is available, notifications, the sync dot and, from 1024 px, the collapse control. The account menu SHALL offer Settings, Help and Keyboard shortcuts, each with its registered shortcut shown, and after a separator Sign out, which opens the same confirmation as Settings → Account. Below 768 px the footer SHALL be the same row with touch-height targets. With a fine pointer, sidebar rows SHALL be 32 px high and group headings tighter; with a coarse pointer rows keep their touch height. The sidebar's scroller SHALL have a thin scrollbar in the theme's border colour, stronger while the pointer or focus is inside it, and SHALL fade its top or bottom edge only while content is hidden past that edge, leaving the scrollbar itself unfaded.

#### Scenario: Short desktop window
- **WHEN** a user with twelve projects opens the app in a 1280×600 window with a mouse
- **THEN** at least eight projects are visible in the sidebar without scrolling, the footer takes one row, and the bottom edge of the scroller fades while projects are hidden below it

#### Scenario: Footer names
- **WHEN** a screen reader user moves through the footer row on a desktop
- **THEN** each control announces its name (the person's name as the account menu button, Notifications with its unread count, the sync status, Collapse sidebar), and the account menu's items announce Settings, Help, Keyboard shortcuts and Sign out with their shortcuts as descriptions

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

## ADDED Requirements

### Requirement: Quiet markers in the sidebar
State in the sidebar SHALL be marked with one language: a small dot in the accent colour, with the meaning in the element's tooltip and accessible name, never a filled or coloured badge with text. The rhythm marker on More and on the Review entry SHALL be such a dot. The danger colour SHALL be reserved for errors. Markers are derived from local data, so they are correct offline and follow every sync; nothing is written for them.

#### Scenario: Review due on More
- **WHEN** the last weekly review was finished nine days ago and the user is in Lists only or Companion mode on a desktop
- **THEN** the More row shows a dot after its label and no text badge, hovering or focusing the row reads "Review due · last weekly review 9 days ago", the row's accessible name includes that text, and in the More menu the Review item's description says the same

#### Scenario: Count on hover
- **WHEN** the user moves the pointer over "Website launch" (5 open tasks) in the Projects group
- **THEN** "5" appears at the row's right edge without the row growing, it disappears when the pointer leaves, Tab onto the row shows it again, and a screen reader reads the row as "Website launch, 5 open tasks" whether or not it is hovered

#### Scenario: Error marks stay
- **WHEN** a saved filter's query no longer parses and sync fails
- **THEN** the filter row keeps its error mark with the message in its accessible name, and the sync dot turns to the danger colour with "Sync error" beside it

### Requirement: Notification bell marker
The notification bell in the sidebar footer SHALL show a dot in the accent colour for one unread notification, a small count in the accent colour above one, and nothing with none; its accessible name SHALL state the number ("Notifications, 2 unread"). The mark is read from the local notification cache, so it is correct offline and changes with every sync; nothing is written for it.

#### Scenario: One notification
- **WHEN** one unread notification arrives on sync
- **THEN** the bell shows a dot in the accent colour and no number, and its accessible name is "Notifications, 1 unread"

#### Scenario: Several notifications
- **WHEN** a third unread notification arrives
- **THEN** the bell shows "3" in a small accent count, never in red, and reading the first one from the list changes it to "2"
