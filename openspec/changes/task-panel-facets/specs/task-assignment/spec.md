# Spec Delta

## MODIFIED Requirements

### Requirement: Assignee on task rows and detail
Task rows in shared projects SHALL show the assignee compactly. The detail panel SHALL show the assignee as the first part of the Who line, with a picker limited to the project's current members from the local membership cache, so it works offline; clearing it SHALL unassign. When the user is the only assignable account (the Inbox, an unshared project, or a shared project with no other member), the part SHALL be shown only while the task is assigned to the user, reading "You", with a "Show in Assigned to me" switch in its popover; the Add menu SHALL offer "Show in Assigned to me" otherwise. Neither writes an operation by itself.

#### Scenario: Picker lists members only
- **WHEN** the user opens the assignee part on a task in a shared project
- **THEN** its popover lists exactly the project's members with their names and an "Unassigned" option, filterable by typing

#### Scenario: Personal task
- **WHEN** the user opens the detail panel of an unassigned task in an unshared project
- **THEN** no assignee part is shown, the Add menu offers "Show in Assigned to me" under Who, and no operation is written

#### Scenario: Shared project with several members keeps Unassigned
- **WHEN** the user opens an unassigned task in a project shared with Bob
- **THEN** the Who line reads "Unassigned" as its assignee part

#### Scenario: Self-assigned personal task
- **WHEN** the user turns on "Show in Assigned to me" for a task in an unshared project
- **THEN** the Who line reads "You", the task is listed in Assigned to me, and the switch in the part's popover turns it off again
