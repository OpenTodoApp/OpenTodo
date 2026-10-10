# project-sharing Specification

## Purpose
Lets a project owner share a project with other accounts on the same server, defines what the viewer, editor, admin and owner roles may do, and guarantees that every member's devices converge on the same state even when roles change while a member is offline.

## Requirements

### Requirement: Project membership and roles
A project SHALL have exactly one `owner` and any number of members with the role `viewer`, `editor` or `admin`. The owner and admins SHALL be able to add an existing account as a member by its exact email with a chosen role and to change a member's role. Membership SHALL be visible to every member of the project and SHALL be cached on each device so it is available offline; a device SHALL adopt the server's membership on every sync so all devices converge on the same member list.

#### Scenario: Share with an existing account
- **WHEN** the owner adds `bob@example.com`, an existing account, as `editor`
- **THEN** the project lists Bob as an editor, every member sees him in the member list after their next sync, and Bob's devices receive the project on their next sync

#### Scenario: Unknown email
- **WHEN** a member is added by an email that has no account on this server
- **THEN** the request is refused with a 404 `user_not_found` error, no invitation is created, and the response does not reveal any other account's email

#### Scenario: Role change while the member is offline
- **WHEN** an admin changes Bob from `editor` to `viewer` while Bob's device is offline
- **THEN** Bob's device keeps showing the project read-write until it syncs, and after the sync it shows the project read-only with the viewer role

### Requirement: Role permissions
A `viewer` SHALL read the project and its tasks. An `editor` SHALL additionally create, edit, complete and delete tasks in the project. An `admin` SHALL additionally rename, recolour and archive the project and manage members other than the owner. Only the `owner` SHALL delete the project, transfer ownership and change or remove admins. Every write SHALL be checked on the server regardless of what the client allowed, and a refused write SHALL leave the server state unchanged on every device.

#### Scenario: Viewer tries to edit
- **WHEN** a viewer's device submits an operation changing a task title in the shared project
- **THEN** the operation is rejected, the title stays as it was on every other member's device, and the viewer's device discards its local change

#### Scenario: Editor renames the project
- **WHEN** an editor submits an operation changing the project name
- **THEN** the operation is rejected and the name is unchanged for every member

#### Scenario: Admin manages members
- **WHEN** an admin changes a viewer to editor and removes another editor
- **THEN** both changes take effect, while the same admin changing the owner's role is refused with a 403 `forbidden` error

### Requirement: Shared project reaches every member
Once a project is shared, its current state and the full history of its operations SHALL be delivered to each member's devices through the ordinary sync exchange, and operations written by any member SHALL reach every other member's devices. Members' concurrent and offline edits SHALL converge under the same per-field last-writer-wins rule as a single user's devices.

#### Scenario: New member catches up
- **WHEN** Bob is added to a project with 40 tasks and his device syncs
- **THEN** his device holds the project and all 40 tasks with the same field values as the owner's device, in the same sidebar position group as his own projects

#### Scenario: Two members edit offline
- **WHEN** Alice changes a task's due date offline and Bob changes the same task's priority offline, and both devices come back online
- **THEN** every member's device shows both the new due date and the new priority

#### Scenario: Owner's other devices are unaffected by sharing
- **WHEN** the owner shares a project from one device
- **THEN** the owner's other devices keep their cursor and existing data and simply begin to see members' edits on later syncs

### Requirement: Deterministic rejection of unauthorized operations
The server SHALL check each operation against the author's membership at the moment it is received, never against the operation's timestamp. A failing operation SHALL be refused individually, reported with its id and a reason, and never stored; the rest of the batch SHALL be applied. The device SHALL drop a refused operation from its outbox and restore the server's value for that field, so a member whose role changed while offline converges with everyone else.

#### Scenario: Downgraded while offline
- **WHEN** Bob edits five tasks offline, is downgraded to viewer before he reconnects, and then syncs
- **THEN** the five operations are reported as rejected with reason `forbidden`, Bob's device shows the server's values for those fields, and other members never see Bob's edits

#### Scenario: Mixed batch
- **WHEN** one request carries an operation on Bob's own personal task and an operation on a shared project he was removed from
- **THEN** the personal operation is applied, the other is rejected, and the response reports exactly one rejected id

#### Scenario: Rejection is repeatable
- **WHEN** a device resends a batch containing an already rejected operation because the previous response was lost
- **THEN** the outcome is identical: the operation is rejected again and nothing is stored

### Requirement: Leaving and removing members
Any member except the owner SHALL be able to leave. Admins SHALL be able to remove viewers and editors; the owner SHALL be able to remove anyone but themselves. After a departure the person's devices SHALL receive no more of the project's operations, SHALL purge the project and its tasks from local storage on their next sync, and their queued operations for it SHALL be rejected. Remaining members converge because a departure changes no project data.

#### Scenario: Member leaves
- **WHEN** Bob leaves a shared project
- **THEN** the project disappears from the sidebar of every one of Bob's devices after their next sync, its tasks are no longer in his local storage, and the project still exists unchanged for the other members

#### Scenario: Removed with queued edits
- **WHEN** Bob is removed while his device holds unsent edits to the project and the device then syncs
- **THEN** the edits are rejected, the project is purged from his device, and his personal data is untouched

#### Scenario: Owner cannot leave
- **WHEN** the owner tries to leave the project
- **THEN** the request is refused with a 409 `owner_must_transfer` error explaining that ownership must be transferred first

### Requirement: Owner transfer
The owner SHALL be able to transfer ownership to an existing member. After the transfer the previous owner SHALL become an admin and the new owner SHALL hold every owner right, including deleting the project. Ownership SHALL change only on the server, so all devices learn the new owner on their next sync and offline devices cannot create two owners.

#### Scenario: Transfer to an editor
- **WHEN** Alice transfers ownership of a project to Bob, currently an editor
- **THEN** Bob is the owner, Alice is an admin, and both see the new roles after their next sync

#### Scenario: Transfer to a non-member
- **WHEN** the owner names an account that is not a member of the project
- **THEN** the request is refused with a 400 `invalid_input` error and ownership is unchanged

### Requirement: Task scope is fixed by its project
A task SHALL belong to the sharing scope of its project: members see it in a shared project, only its owner sees it in the Inbox or an unshared project. Moving a task into another scope SHALL be a copy plus a soft delete of the original, so no operation changes who can see an existing task. Only the owner SHALL delete a shared project, which soft-deletes it and its tasks for every member and copies open tasks into the owner's Inbox. All of this works offline and converges by last-writer-wins.

#### Scenario: Move a task out of a shared project
- **WHEN** an editor moves a task from a shared project to their personal Inbox
- **THEN** a new task with the same fields appears in their Inbox, the original is soft-deleted in the shared project for every member, and the move works while offline

#### Scenario: Scope change by direct operation
- **WHEN** a device submits an operation that sets a shared task's project to a project in another scope
- **THEN** the operation is rejected with reason `scope_change` and the task stays where it was for every member

#### Scenario: Owner deletes a shared project
- **WHEN** the owner deletes a shared project that has three open tasks
- **THEN** the project and its tasks are hidden on every member's devices after sync and the owner's Inbox lists copies of the three open tasks

### Requirement: Membership routes
The API SHALL expose list, add, change-role, remove and transfer routes under `/api/v1/projects/{id}/members` and `/api/v1/projects/{id}/transfer`. All of them SHALL require a valid session or API token, SHALL apply the role rules above, and SHALL return the JSON error envelope on failure. Collection and export routes SHALL include the shared projects and tasks the caller is a member of, with the caller's role on each shared project.

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches any membership route
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Non-member lists members
- **WHEN** an authenticated user who is not a member requests the member list of a project
- **THEN** the response is a 404 `not_found` error that does not reveal the project's existence

#### Scenario: Export includes shared projects
- **WHEN** a member requests the export
- **THEN** the document includes the shared projects and their tasks, each shared project carrying the caller's role and the owner's id, alongside the caller's personal data

### Requirement: Sharing in the client
The client SHALL mark shared projects in the sidebar, show the member list and roles from the project header, offer a share dialog to the owner and admins, and render the project read-only for viewers, all from the locally cached membership so it behaves the same offline. Every sharing action SHALL be reachable with the keyboard.

#### Scenario: Viewer opens a shared project offline
- **WHEN** a viewer opens the app without a network and navigates to the shared project
- **THEN** the tasks are listed, the quick-add input and edit controls are disabled with a read-only notice, and the member list still shows

#### Scenario: Share dialog with the keyboard
- **WHEN** the owner presses the share shortcut in a project view, types an email, picks a role and confirms
- **THEN** the member is added without any mouse interaction and appears in the member list
