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
When a member leaves or is removed from a project, or their account is deleted, every task in that project assigned to them SHALL be unassigned by operations written by the server, except that a recurring task with a rotation (see "Rotating assignee on recurring tasks") SHALL instead be assigned to the next person of its rotation among the remaining members, or unassigned when none remains; in the same server-authored batch the departing account SHALL be removed from every rotation in that project, so devices that were offline during the departure converge on the unassigned state without client logic. The person a rotating task is handed to SHALL receive the assignment notification worded as their turn, as after a completion, unless they are the author of the departure; an unassignment SHALL NOT notify anyone. Assignments to that person submitted afterwards SHALL be rejected.

#### Scenario: Removed member had tasks
- **WHEN** Bob, assignee of four tasks in a shared project, is removed
- **THEN** after their next sync all members' devices show those four tasks unassigned, and the unassignments appear as server-authored changes

#### Scenario: Offline assignment to a departed member
- **WHEN** Alice assigns a task to Bob offline, Bob leaves before Alice reconnects, and Alice syncs
- **THEN** the assignment is rejected with reason `not_a_member` and Alice's device shows the task unassigned

#### Scenario: Deleted account had tasks in someone else's project
- **WHEN** the owner deletes Bob's account while Bob is the assignee of a task in Alice's shared project
- **THEN** the task is unassigned by a server-authored change in Alice's project, Alice's devices show it unassigned after their next sync, and webhooks see the change

#### Scenario: Departing member held a rotating chore
- **WHEN** Bob is removed from "House" while it is his turn on "Bins", which rotates Alice → Bob → Carol
- **THEN** after the next sync every member's device shows Bins assigned to Carol with the rotation Alice → Carol, both written as server-authored changes

#### Scenario: Turn handed on by a departure is announced
- **WHEN** Bob leaves "House" while it is his turn on "Bins", which rotates Alice → Bob → Carol
- **THEN** Carol is notified "It's your turn: Bins", as if Bob had completed it, and nobody is notified about Bob's other tasks being unassigned

#### Scenario: Last other member leaves
- **WHEN** Carol leaves a project whose rotating task "Litter" rotates Alice → Carol and is assigned to Carol
- **THEN** Litter is assigned to Alice and its rotation holds Alice only, which no longer rotates

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
Read in-app notifications older than 90 days SHALL be removed when the server opens the data directory and, while it runs, within a minute of the oldest read notification passing 90 days, on a self-hosted server as on a host. Unread notifications SHALL be kept whatever their age.

#### Scenario: Server running for months
- **WHEN** a self-hosted server runs without a restart and a read notification passes 90 days
- **THEN** it is removed within a minute, and unread notifications stay

#### Scenario: Old notification read late
- **WHEN** a user reads a notification created 100 days ago
- **THEN** it is removed within a minute of being read

### Requirement: Rotating assignee on recurring tasks
A task SHALL have an optional `rotation`, an ordered list of at most 20 distinct account ids, empty by default, written and synced as one whole-list operation that is applied locally first, works offline and converges by last-writer-wins. The server SHALL refuse at receipt, with reason `not_a_member`, an operation whose rotation names an account that is not a current member of the task's scope, leaving the previous value on every device. A rotation SHALL take effect only on a top-level recurring task whose scope has at least two members; elsewhere it SHALL be kept but inert and hidden. Account ids in a rotation SHALL be stored in plaintext, like the assignee, for accounts with end-to-end encryption too.

#### Scenario: Set a rotation offline
- **WHEN** Alice, an editor of the shared project "House", sets "Bins" (every Monday) to take turns Alice → Bob → Carol while offline
- **THEN** the rotation shows in her task panel at once and on every member's device after sync

#### Scenario: Concurrent rotations
- **WHEN** Alice sets the rotation Alice → Bob and Carol, offline, sets Carol → Bob on the same task, and both sync
- **THEN** every device shows the rotation written with the greater timestamp, whole

#### Scenario: Non-member in the rotation
- **WHEN** a device submits a rotation naming an account that is not a member of the project
- **THEN** the operation is rejected with reason `not_a_member` and the task keeps its previous rotation everywhere

#### Scenario: Rule removed
- **WHEN** the recurrence of a rotating task is removed
- **THEN** the rotation is kept but hidden, completing the task does not change its assignee, and adding a rule back shows the rotation again

### Requirement: Completion passes the turn
Completing the current occurrence of a rotating series SHALL, in the same batch as the occurrence record and the next due date, set the series' assignee to the next person: the person after the current assignee among the rotation's current members, wrapping around, or the first of them when the current assignee is not among them; with no current member in the rotation the assignee SHALL stay. The occurrence record SHALL keep the assignee who held it. The choice SHALL depend only on the rotation, the current assignee and the membership, and SHALL be computed identically by the web client and by every server completion path (REST, CalDAV, the MCP tools and automation rules), pinned by shared test vectors. Skipping an occurrence, detaching one, reopening a record and reassigning SHALL NOT rotate; a series that ends with this completion SHALL keep its assignee. The new assignee SHALL receive the assignment notification, worded as their turn.

#### Scenario: Bob's turn next
- **WHEN** Alice completes "Bins", assigned to her and rotating Alice → Bob → Carol
- **THEN** the occurrence appears in Completed as done by Alice, Bins is due next Monday assigned to Bob, and Bob is notified "It's your turn: Bins"

#### Scenario: Wrap around
- **WHEN** Carol completes the same task on her turn
- **THEN** it is assigned to Alice

#### Scenario: Two devices complete offline
- **WHEN** Alice's phone and Bob's laptop both complete the same occurrence of "Bins" while offline and then sync
- **THEN** every device shows one completion record, one next due date and the same next assignee

#### Scenario: Stale membership on an offline device
- **WHEN** Bob was removed while Alice's phone was offline, and the phone completes "Bins" and names Bob as the next assignee
- **THEN** the record and the next due date are accepted, the assignee change is refused with `not_a_member`, and every device shows the assignee the server chose when Bob left

#### Scenario: Skip keeps the turn
- **WHEN** Bob skips this week's "Bins"
- **THEN** Bins moves to next Monday and stays assigned to Bob

#### Scenario: Completion through CalDAV
- **WHEN** a calendar app marks the current occurrence of a rotating task completed
- **THEN** the server rotates the assignee exactly as the app would

#### Scenario: Same vectors on both sides
- **WHEN** the shared rotation vectors are evaluated by the web client and by the server
- **THEN** both choose the same next assignee for every vector

### Requirement: Rotation in the client
In a project with at least two members, the Assignee menu of a recurring task SHALL offer "Take turns…" to editors, admins and the owner, opening an ordered people list that can be reordered with the pointer and the keyboard, filled from the project's members with the people picker and from "Add everyone in <group>" for each workspace group on the project (adding its current members once), and cleared with "Stop taking turns". The task panel SHALL show the rotation as one line under the assignee with the current assignee emphasised, and a row SHALL mark a rotating task's assignee avatar with a rotate glyph that has an accessible name. Personal projects, non-recurring tasks and viewers SHALL NOT be offered the action, and a viewer SHALL see the line read-only. Assigned to me SHALL list a rotating task only for its current assignee.

#### Scenario: Personal project
- **WHEN** a user opens the Assignee menu of a recurring task in a project only they belong to
- **THEN** no "Take turns…" item is shown

#### Scenario: Fill from a group
- **WHEN** an editor chooses "Add everyone in Adults" for a project shared with the group Adults (Alice, Bob, Carol)
- **THEN** the three are added to the rotation in that order, and a later change to the group does not change the rotation

#### Scenario: Reorder with the keyboard
- **WHEN** the user focuses Carol in the list and presses Alt+Up twice
- **THEN** Carol is first, and the rotation is saved as one operation

### Requirement: Rotation through the API
The REST task representation SHALL include `rotation`, and `PATCH /api/v1/tasks/{id}` SHALL accept it under the same authentication and role rules as the assignee. A rotation with duplicates, more than 20 ids, on a task without a recurrence, on a subtask or in a scope with fewer than two members SHALL be refused with 400 `invalid_rotation`; one naming a non-member SHALL be refused with 409 `not_a_member`. Completing a rotating task through the API SHALL rotate it. The command-line client SHALL set and clear a rotation with `ot task edit --rotate` and `--no-rotate`, and the MCP task view and update tool SHALL expose it.

#### Scenario: Set through the API
- **WHEN** a client with a full token patches a recurring task of a shared project with the ids of two members
- **THEN** the response is 200 with the rotation, and every member's device shows it after sync

#### Scenario: Unauthenticated
- **WHEN** the same request arrives without credentials
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Viewer
- **WHEN** a viewer patches the rotation
- **THEN** the response is 403 `forbidden` and the rotation is unchanged

#### Scenario: Not recurring
- **WHEN** a client sets a rotation on a task without a recurrence
- **THEN** the response is 400 `invalid_rotation`

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
