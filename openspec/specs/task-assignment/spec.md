# task-assignment Specification

## Purpose
Lets members of a shared project assign each task to one member, gives every user a view of what is assigned to them, and keeps assignments consistent when membership changes.

## Requirements

### Requirement: Assignee field
A task SHALL have an optional assignee, stored as the id of an account. In a shared project the assignee MUST be a current member; in the Inbox or an unshared project it MUST be the owner or empty. The field SHALL be written and synced as an ordinary operation, so assigning works offline and concurrent assignments converge to the one with the greater timestamp.

#### Scenario: Assign to a member
- **WHEN** an editor assigns a task in a shared project to Bob, a member
- **THEN** every member's devices show Bob as the assignee after sync

#### Scenario: Assign to a non-member
- **WHEN** a device submits an assignment to an account that is not a member of the task's project
- **THEN** the operation is rejected with reason `not_a_member`, the task keeps its previous assignee everywhere, and the submitting device restores that value

#### Scenario: Concurrent assignments
- **WHEN** Alice assigns a task to Bob offline and Carol assigns the same task to Dan offline, and both sync
- **THEN** every device shows the assignee written with the greater timestamp

### Requirement: Assignment permissions
Editors, admins and the owner SHALL be able to assign and unassign tasks in a shared project; viewers SHALL NOT. Any member who can assign SHALL be able to assign to any member, including themselves. The check SHALL run on the server at receipt time, per operation, and refusals SHALL leave the server state unchanged on every device.

#### Scenario: Viewer assigns
- **WHEN** a viewer's device submits an assignment operation
- **THEN** it is rejected with reason `forbidden` and the assignee is unchanged for every member

#### Scenario: Self-assignment with the keyboard
- **WHEN** an editor presses the assign shortcut on a selected task and chooses themselves
- **THEN** the task is assigned to them immediately, with no network round trip

### Requirement: Unassign on departure
When a member leaves or is removed from a project, or their account is deleted, every task in that project assigned to them SHALL be unassigned by operations written by the server, so devices that were offline during the departure converge on the unassigned state without client logic. Assignments to that person submitted afterwards SHALL be rejected.

#### Scenario: Removed member had tasks
- **WHEN** Bob, assignee of four tasks in a shared project, is removed
- **THEN** after their next sync all members' devices show those four tasks unassigned, and the unassignments appear as server-authored changes

#### Scenario: Offline assignment to a departed member
- **WHEN** Alice assigns a task to Bob offline, Bob leaves before Alice reconnects, and Alice syncs
- **THEN** the assignment is rejected with reason `not_a_member` and Alice's device shows the task unassigned

#### Scenario: Deleted account had tasks in someone else's project
- **WHEN** the owner deletes Bob's account while Bob is the assignee of a task in Alice's shared project
- **THEN** the task is unassigned by a server-authored change in Alice's project, Alice's devices show it unassigned after their next sync, and webhooks see the change

### Requirement: Assigned to me view
The client SHALL offer an "Assigned to me" view listing the user's open assigned tasks across all projects, grouped by project, reachable from the sidebar's More group and a `g`-prefixed keyboard shortcut, with a live count. The view SHALL be rendered from local storage so it works offline and updates as soon as synced assignments arrive.

#### Scenario: Open the view offline
- **WHEN** the user opens the app without a network and navigates to Assigned to me
- **THEN** every open task assigned to them that was present at the last sync is listed under its project

#### Scenario: Completing from the view
- **WHEN** the user completes a task from Assigned to me
- **THEN** the task leaves the view and the sidebar count decreases without a reload

### Requirement: Assigned to me sidebar entry
The sidebar entry SHALL be shown only when the user is a member of at least one shared project or has at least one assigned task; the view SHALL stay reachable by address and shortcut.

#### Scenario: Solo install
- **WHEN** a user has no shared project and no assigned task
- **THEN** the sidebar shows no Assigned to me entry, and `g a` still opens the view with its empty state

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

### Requirement: Assignment notification hook
Assigning a task to someone other than the author SHALL emit an assignment event on the server when the operation is applied. This change SHALL deliver it as an in-app notification to the assignee, listed and markable as read through `GET /api/v1/notifications` and `POST /api/v1/notifications/{id}/read`, both requiring authentication. Notifications SHALL be stored server-side and cached on the client, so they are visible offline once fetched; no external service is contacted.

#### Scenario: Assignee is notified
- **WHEN** Alice assigns a task to Bob and Bob's device syncs
- **THEN** Bob sees an unread notification naming Alice, the task and the project, and it is marked read when he opens the task

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches the notifications routes
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Marking someone else's notification
- **WHEN** a user tries to mark read a notification that belongs to another account
- **THEN** the response is a 404 `not_found` error and nothing changes

### Requirement: Assignee picker ordering and search
The assignee picker SHALL follow the design-system picker rules. With an empty query it lists "Unassigned" and "You" first, then the members assigned most recently on this device, then the remaining current members by name. Typing matches names and emails by word prefix or fuzzily. Members are shown with their avatar. The options remain limited to the project's current members as specified in "Assignee on task rows and detail".

#### Scenario: Frequent assignee near the top
- **WHEN** the user often assigns tasks in a shared project to Sam and opens the assignee picker
- **THEN** Sam is listed directly after "Unassigned" and "You"

#### Scenario: Offline assignment converges
- **WHEN** the device is offline and the user assigns a task to a member from the picker
- **THEN** the assignee is written as one operation applied locally, and on reconnect the server re-checks membership and the field converges on all devices under last-writer-wins

### Requirement: Show in Assigned to me
In a scope where the user is the only assignable account, the Assignee property SHALL not be shown in the task panel by default; the panel's Add menu SHALL offer "Show in Assigned to me", which assigns the task to the user, and the resulting Assignee chip SHALL offer to remove it, each as one ordinary assignee operation applied locally first, working offline and converging by last-writer-wins. The Assigned to me view SHALL keep listing only explicitly assigned tasks.

#### Scenario: Pin a personal task to Assigned to me
- **WHEN** the user picks "Show in Assigned to me" from the Add menu of an Inbox task while offline
- **THEN** the task appears in Assigned to me at once, and on the user's other devices after sync

#### Scenario: Implicit You is not listed
- **WHEN** the user has ten unassigned tasks in an unshared project
- **THEN** Assigned to me does not list them and their panels show no Assignee chip

### Requirement: Implicit You ends when a project gains members
When a project the user owned alone gains a member, its unassigned tasks SHALL read "Unassigned" from then on, and tasks the user had explicitly assigned to themselves SHALL stay assigned to them; no operation SHALL be written for this transition.

#### Scenario: Sharing a project
- **WHEN** the user shares a project containing one self-assigned task and four unassigned tasks with Bob
- **THEN** after the membership syncs, the self-assigned task reads "You" in the assignee picker and the other four read "Unassigned"

### Requirement: Read notifications are removed after 90 days
Read in-app notifications older than 90 days SHALL be removed when the server opens the data directory and then once a day while it runs, on a self-hosted server as on a host. Unread notifications SHALL be kept whatever their age.

#### Scenario: Server running for months
- **WHEN** a self-hosted server runs without a restart and a read notification passes 90 days
- **THEN** it is removed within a day, and unread notifications stay
