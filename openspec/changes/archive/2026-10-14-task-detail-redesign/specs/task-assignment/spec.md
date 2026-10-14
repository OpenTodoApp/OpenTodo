## MODIFIED Requirements

### Requirement: Assignee on task rows and detail
Task rows in shared projects SHALL show the assignee compactly, and the detail panel SHALL offer an assignee picker limited to the project's current members from the local membership cache, so it works offline. Clearing the picker SHALL unassign. When the user is the only account that can be assigned (the Inbox, an unshared project, or a shared project whose only member is the user), the detail panel SHALL instead show the assignee as "You" and offer a "Show in Assigned to me" switch; this presentation SHALL write no operation by itself.

#### Scenario: Picker lists members only
- **WHEN** the user opens the assignee picker on a task in a shared project
- **THEN** it lists exactly the project's members with their names and an "Unassigned" option, filterable by typing

#### Scenario: Personal task
- **WHEN** the user opens the detail panel of an unassigned task in an unshared project
- **THEN** the assignee row reads "You", the "Show in Assigned to me" switch is off, and no operation is written

#### Scenario: Shared project with several members keeps Unassigned
- **WHEN** the user opens an unassigned task in a project shared with Bob
- **THEN** the assignee row reads "Unassigned"

## ADDED Requirements

### Requirement: Show in Assigned to me
In a scope where the user is the only assignable account, turning on "Show in Assigned to me" SHALL assign the task to the user and turning it off SHALL unassign it, each as one ordinary assignee operation applied locally first, working offline and converging by last-writer-wins. The Assigned to me view SHALL keep listing only explicitly assigned tasks.

#### Scenario: Pin a personal task to Assigned to me
- **WHEN** the user turns on "Show in Assigned to me" for an Inbox task while offline
- **THEN** the task appears in Assigned to me at once, and on the user's other devices after sync

#### Scenario: Implicit You is not listed
- **WHEN** the user has ten unassigned tasks in an unshared project
- **THEN** Assigned to me does not list them, although each panel reads "You"

### Requirement: Implicit You ends when a project gains members
When a project the user owned alone gains a member, its unassigned tasks SHALL read "Unassigned" from then on, and tasks the user had explicitly assigned to themselves SHALL stay assigned to them; no operation SHALL be written for this transition.

#### Scenario: Sharing a project
- **WHEN** the user shares a project containing one self-assigned task and four unassigned tasks with Bob
- **THEN** after the membership syncs, the self-assigned task reads "You" in the assignee picker and the other four read "Unassigned"
