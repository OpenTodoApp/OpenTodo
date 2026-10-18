# Spec Delta

## MODIFIED Requirements

### Requirement: Sidebar structure
The sidebar SHALL show, top to bottom:
1. the app name
2. the primary destinations, pinned at the top
3. in one scroller, a "More" group collapsed by default, then the Filters, Projects and Labels groups, each collapsible with its state remembered on the device and its item count on the header while collapsed
4. a pinned footer with Help, search, notifications, sync status and the account

Counts SHALL appear on Inbox, Today, projects and collapsed group headers only.

The primary destinations and the More group SHALL depend on the user's "How you work" preference:

| Preference | Primary destinations | More group |
| --- | --- | --- |
| `lists` and `companion` | Inbox, Today, Upcoming, Calendar (Day or Week, as last used) | Loop home, Next, Waiting, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Review, Statistics, Ask when available |
| `first` | Loop home, Inbox, Today, Next, Waiting, Review | Upcoming, Calendar, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter, Statistics, Ask when available |

In `first` mode the primary destinations SHALL never exceed six. Promoted destinations SHALL be listed in the More group, and the stored promotion list SHALL be kept unchanged.

#### Scenario: Default sidebar
- **WHEN** a user in `lists` mode with projects and labels opens the app on a 1280×800 screen
- **THEN** four primary destinations and the More group are visible above Filters, Projects and Labels, the footer is visible without scrolling, and only the middle part scrolls when the project tree is long

#### Scenario: Open Loops first sidebar
- **WHEN** a user picks Open Loops first and opens the app on a 1280×800 screen
- **THEN** the primary destinations are Loop home, Inbox, Today, Next, Waiting and Review in that order, Upcoming and Calendar are in the More group, and the Review entry carries its rhythm markers

#### Scenario: Promotions kept across modes
- **WHEN** a user who promoted Someday switches to Open Loops first and later back to Companion
- **THEN** Someday is in the More group while in Open Loops first, and is a primary destination again after switching back, on every device after sync

#### Scenario: Labels are reachable
- **WHEN** the user has forty projects and three labels
- **THEN** scrolling the middle part of the sidebar reaches the Labels group, and nothing inside it scrolls separately

#### Scenario: Promote a destination
- **WHEN** a user in `lists` mode turns on "Show in sidebar" for Someday in Settings → Appearance
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
