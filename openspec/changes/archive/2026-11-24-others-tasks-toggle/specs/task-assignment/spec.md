## MODIFIED Requirements

### Requirement: Personal views hide tasks assigned to others
The personal views SHALL show the work the viewer can act on: Inbox, Today, Upcoming (with Start with Today too), Anytime, Someday and Next SHALL leave out a task whose assignee is an account other than the viewer, and SHALL keep a task assigned to the viewer and a task with no assignee. The same rule SHALL apply to what is derived from those views: the sidebar's Today count, the app icon badge and its stored counts for the next days, the day-page briefing on Today and Upcoming, Today's Earlier tasks in the command palette, Today's limit and its slots, Close the day, the display of Today and Upcoming, the widgets of the native shells, and the MCP and in-app assistant's `today_summary`. A project's own list, Assigned to me, Waiting, labels, places, saved views and the Filter view (whose `assigned` terms decide), the calendar views and Completed SHALL be unchanged and list such a task. The rule SHALL be derived from local task rows and the viewer's account id, so it is right offline, follows a reassignment on any device as soon as it syncs, and matches another device once both hold the same tasks.

The menu of Today, Upcoming, Anytime and Someday SHALL offer a checkable item "Show tasks assigned to others", announced as checked or not and showing a check while on, so the menu shows the current state. On a phone it SHALL be in the bar's overflow. It SHALL be offered only while the device knows a shared project with a member other than the viewer; otherwise it SHALL not be offered and a stored value SHALL be kept. While it is on, the lists of Today, Upcoming (with Start with Today too), Anytime and Someday SHALL also list tasks assigned to others. Next and everything derived from the views (the counts, the badge, the briefing, the palette, Today's limit, Close the day, the display, the widgets and `today_summary`) SHALL keep the rule, so they count the viewer's own work, and a task assigned to someone else SHALL never take one of Today's slots. The option SHALL be a synced preference of the account, `user_prefs.today_assignees`: `all` turns it on; empty, `mine` and any other value read as off and SHALL not be rewritten. Choosing the item SHALL write one operation locally first: it SHALL work offline, reach the account's other devices with sync and converge by last-writer-wins.

#### Scenario: Shared workspace
- **WHEN** a shared project has, due today, a task assigned to the viewer, an unassigned task and a task assigned to Sam
- **THEN** Today lists the first two, the sidebar Today count and the icon badge count two, and the project's list shows all three

#### Scenario: Reassigned while offline
- **WHEN** the viewer, offline, reassigns a task in Upcoming to Sam
- **THEN** it leaves Upcoming at once, stays in its project, and is listed in Waiting under Sam

#### Scenario: Given back
- **WHEN** Sam assigns that task back to the viewer on another device and the change syncs
- **THEN** it returns to Upcoming without any write on the viewer's device

#### Scenario: Someday and Anytime
- **WHEN** a shared project has a task parked in Someday and a task with no dates, both assigned to Sam
- **THEN** neither Someday nor Anytime lists them for the viewer, and both list them for Sam

#### Scenario: Off by default
- **WHEN** the viewer opens Today's menu in a shared workspace and has never set the option
- **THEN** "Show tasks assigned to others" is offered unchecked, and Today does not list a task assigned to Sam

#### Scenario: Show them offline
- **WHEN** the device is offline and the viewer checks "Show tasks assigned to others" while Today holds a task assigned to the viewer, an unassigned task and a task assigned to Sam
- **THEN** Today lists all three at once, the item shows a check, Upcoming, Anytime and Someday list Sam's tasks too, the sidebar Today count is unchanged, and the choice is queued as one operation

#### Scenario: Hide them again
- **WHEN** the option is on and the viewer unchecks the item in Upcoming's menu
- **THEN** Sam's tasks leave Today, Upcoming, Anytime and Someday, and the viewer's own and unassigned tasks stay

#### Scenario: Another device follows
- **WHEN** the viewer turned the option on on their phone and the laptop syncs
- **THEN** the laptop's Today lists Sam's task and its menu shows the item checked, without a write on the laptop

#### Scenario: Slots stay the viewer's
- **WHEN** Today's limit is 3, the option is on, and Today holds three of the viewer's tasks and one of Sam's
- **THEN** the viewer's three tasks hold the slots and Sam's task is listed without taking one

#### Scenario: No option to show them
- **WHEN** the viewer is a member of no shared project
- **THEN** no list's menu offers to show tasks assigned to others, and a stored `all` is kept and not rewritten

#### Scenario: My subtask of someone else's task
- **WHEN** a task due today is assigned to Sam and has two subtasks due today, one assigned to the viewer and one with no assignee
- **THEN** Today leaves out Sam's task and lists both subtasks as top-level rows

#### Scenario: Assistant summary
- **WHEN** an assistant calls `today_summary` while a task assigned to Sam is overdue
- **THEN** that task is neither in `overdue` nor in `counts.overdue`, and its project's open count still includes it
