## ADDED Requirements

### Requirement: Personal views hide tasks assigned to others
The personal views SHALL show the work the viewer can act on: Inbox, Today, Upcoming (with Start with Today too), Anytime, Someday and Next SHALL leave out a task whose assignee is an account other than the viewer, and SHALL keep a task assigned to the viewer and a task with no assignee. The same rule SHALL apply to what is derived from those views: the sidebar's Today count, the app icon badge and its stored counts for the next days, the day-page briefing on Today and Upcoming, Today's Earlier tasks in the command palette, Today's limit and its slots, Close the day, the display of Today and Upcoming, the widgets of the native shells, and the MCP and in-app assistant's `today_summary`. A project's own list, Assigned to me, Waiting, labels, places, saved views and the Filter view (whose `assigned` terms decide), the calendar views and Completed SHALL be unchanged and list such a task. The rule SHALL have no setting. It SHALL be derived from local task rows and the viewer's account id, so it is right offline, follows a reassignment on any device as soon as it syncs, and matches another device once both hold the same tasks. It SHALL write nothing; a stored `user_prefs.today_assignees` SHALL be kept and ignored.

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

#### Scenario: No option to show them
- **WHEN** the viewer opens Today's menu in a shared workspace
- **THEN** it has no item to hide or show tasks assigned to others

#### Scenario: My subtask of someone else's task
- **WHEN** a task due today is assigned to Sam and has two subtasks due today, one assigned to the viewer and one with no assignee
- **THEN** Today leaves out Sam's task and lists both subtasks as top-level rows

#### Scenario: Assistant summary
- **WHEN** an assistant calls `today_summary` while a task assigned to Sam is overdue
- **THEN** that task is neither in `overdue` nor in `counts.overdue`, and its project's open count still includes it

## REMOVED Requirements

### Requirement: Today hides tasks assigned to others
**Reason**: Replaced by "Personal views hide tasks assigned to others" (issue #1938): one rule for every personal view, with no option.
**Migration**: None. Today now leaves out those tasks for everyone; a stored `today_assignees` value is kept and ignored, and the tasks stay in their project, Waiting and the Filter view.
