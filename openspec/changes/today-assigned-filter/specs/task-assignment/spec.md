# Spec Delta

## ADDED Requirements

### Requirement: Today hides tasks assigned to others
Today's menu SHALL offer "Hide tasks assigned to others" and, while the option is on, "Show tasks assigned to others" in its place. On a phone the item SHALL be in the bar's overflow. The item SHALL be offered only while the device knows a shared project with a member other than the viewer; otherwise it SHALL not be offered and a stored value SHALL be kept. The option SHALL be off by default and SHALL be a synced preference of the account (`user_prefs.today_assignees`, empty or `mine`), written as one operation locally first: it SHALL work offline, reach the account's other devices with sync and converge by last-writer-wins. An empty or unknown stored value SHALL read as off and SHALL not be rewritten.

While the option is off, Today lists every task its date rule includes. While it is on, Today SHALL omit a task whose project the device knows is shared and whose assignee is an account other than the viewer, and SHALL keep a task with no assignee and a task assigned to the viewer. A task in the Inbox or in a project the device does not know as shared SHALL stay, whatever its assignee. The sidebar's Today count, the app icon badge and the day-page briefing's count of Today's tasks SHALL use that same set. Upcoming, project lists and Assigned to me SHALL be unchanged. The list is derived from local tasks, the local membership cache and the local preference, so it is right offline and matches another device once both hold the same tasks, members and preference.

#### Scenario: Off until turned on
- **WHEN** a shared project has a task due today assigned to another member and the viewer has never set the option
- **THEN** Today lists that task, and the menu offers "Hide tasks assigned to others"

#### Scenario: Hide someone else's task
- **WHEN** the viewer turns the option on, Today holds a task assigned to them, an unassigned task and a task in a shared project assigned to someone else, and the device is offline
- **THEN** the someone else's task leaves Today at once, the other two stay, the sidebar Today count and the icon badge drop by one, and the choice is queued as one operation

#### Scenario: A personal task stays
- **WHEN** the option is on and a task in a project with no other member is due today
- **THEN** Today lists it

#### Scenario: Solo account
- **WHEN** the viewer is a member of no shared project
- **THEN** Today's menu has no item for the option, and a stored `mine` is kept and not rewritten

#### Scenario: Phone
- **WHEN** the viewer has a shared project and opens Today's menu on a phone
- **THEN** the item is in the bar's overflow

#### Scenario: The other device follows
- **WHEN** the viewer turns the option on and another device syncs
- **THEN** that device's Today omits the same tasks

#### Scenario: Unknown value
- **WHEN** a newer client stores a value this version does not know in `today_assignees`
- **THEN** Today lists every task its date rule includes and the stored value is left as it is

#### Scenario: Upcoming is not Today
- **WHEN** the option is on and a shared project's task assigned to someone else is due tomorrow
- **THEN** Upcoming lists it
