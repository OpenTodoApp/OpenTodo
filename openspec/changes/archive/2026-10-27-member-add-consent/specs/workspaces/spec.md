## MODIFIED Requirements

### Requirement: Workspace membership and roles
A workspace SHALL have exactly one `owner` (its creator until transferred) and any number of members with the role `admin` or `member`. In a workspace the user created, the owner and admins SHALL add an existing account by its exact email and change roles; the owner SHALL transfer ownership to a member and delete the workspace; any member but the owner SHALL leave; admins SHALL remove members, the owner anyone but themselves. Adding by email SHALL follow the project-sharing rule "Membership invitations for strangers": an account that already shares a shared project or a created workspace with the caller is added at once (201), and any other address, with or without an account, answers 202 `{pending: true}` and becomes an invitation the person accepts or declines, listed as `pending` to the workspace's owner and admins. The default workspace of an account SHALL have that account as its only member and SHALL accept no members. Membership SHALL be visible to every member and cached on each device; a device SHALL adopt the server's list on every sync. Removing a member SHALL also remove every project grant they hold in that workspace, directly or through its groups, with the effects of removal from those projects.

#### Scenario: Add by email
- **WHEN** the owner of "Family" adds `bob@example.com`, an existing account that already shares a project with the owner, as `member`
- **THEN** Bob is listed in Family's members on every member's devices after sync, Bob's devices receive the workspace, and Bob's sidebar offers Family in its switcher

#### Scenario: Add a stranger by email
- **WHEN** the owner of "Family" adds `dan@example.com`, an existing account that shares nothing with the owner
- **THEN** the response is 202 `{pending: true}`, Dan is not a member, Family's member list shows Dan's address as pending to the owner and admins, and Dan becomes a member only after accepting

#### Scenario: Unknown email
- **WHEN** a member is added by an email with no account on this server
- **THEN** the response is the same 202 `{pending: true}` as for a stranger with an account, and does not reveal any account's existence

#### Scenario: Member of the default workspace
- **WHEN** a user tries to add someone to their default workspace
- **THEN** the response is 409 `default_workspace` and nothing changes

#### Scenario: Member cannot manage
- **WHEN** an account with the role `member` adds, removes or changes the role of a member, cancels an invitation, or creates a group
- **THEN** the response is 403 `forbidden`

#### Scenario: Remove a member who holds grants
- **WHEN** an admin removes Carol from "Family", where Carol was a direct editor of "Trip" and a member of the group "Adults" that is on "House"
- **THEN** Carol is no longer a member of Trip or House, her devices purge both projects on their next sync, her queued operations for them are refused, and the other members' data is unchanged

#### Scenario: Owner leaves
- **WHEN** the owner of a workspace tries to leave it
- **THEN** the response is 409 `owner_must_transfer`

#### Scenario: Transfer
- **WHEN** the owner transfers "Family" to Bob
- **THEN** Bob is the owner, the previous owner is an admin, both see the change after sync, and the ownership of the projects in the workspace is unchanged

#### Scenario: Delete a workspace
- **WHEN** the owner deletes "Family", which holds projects shared with two members
- **THEN** the response is 409 `workspace_not_empty` naming the count of projects and members until the projects are moved or deleted and the members removed, and deleting an empty workspace answers 204 and removes it from every device after sync

#### Scenario: Non-member
- **WHEN** an account that is not a member requests a workspace, its members or its groups
- **THEN** the response is 404 `not_found` that does not reveal the workspace's existence

#### Scenario: Deactivated or deleted account
- **WHEN** an account that is a member of three workspaces is deleted by the server owner
- **THEN** it is removed from every workspace and every grant, its default workspace and its personal data are deleted with it, and a workspace it owned is transferred to its oldest admin or, without one, deleted when empty and otherwise kept with the server owner as its owner

### Requirement: A created workspace is a closed directory
In a workspace the user created, a project in that workspace SHALL be shareable only with members and groups of that workspace: adding anyone else to the project, or accepting a project invite link to it from an account outside the workspace, SHALL be refused, and adding an address by email that is not in the directory SHALL answer 409 `not_in_workspace` whether or not an account has it. The assignee picker, the mention completion and the "add member" picker in such a project SHALL offer only the workspace's members, by name, from the local cache. In the default workspace, projects SHALL keep the rule of project sharing: any account on the server can be added by its exact email, at once when it already shares something with the caller and otherwise after accepting an invitation. A member of a shared project who is not a member of the project's workspace SHALL see the project in their default workspace, so a project shared before this change, or moved later, stays reachable for everyone on it.

#### Scenario: Share with an outsider
- **WHEN** the owner of "Website" in "Work" adds `dan@example.com`, an account that is not a member of Work, or `nobody@example.com`, an address without an account
- **THEN** both responses are 409 `not_in_workspace` and nobody is added or invited

#### Scenario: Picker lists the directory
- **WHEN** an admin opens the share dialog of a project in "Work", which has eight members
- **THEN** the people picker lists those eight by name and avatar, filterable by typing, without an email field, and works offline from the cache

#### Scenario: Default workspace keeps today's rule
- **WHEN** a user adds `bob@example.com`, with whom they already share a project, to another project in their default workspace
- **THEN** Bob is added at once, and Bob sees the project in his own default workspace

#### Scenario: Invite link from outside
- **WHEN** an account that is not a member of "Work" accepts a project invite link to a project in Work
- **THEN** the response is 409 `not_in_workspace`, nobody is added, and the invite screen says "Ask the workspace owner to add you first"

#### Scenario: Legacy share after a move
- **WHEN** Alice moves "Trip", shared with Bob, from her default workspace into "Family", of which Bob is not a member
- **THEN** Bob keeps seeing Trip in his default workspace with every task, and Alice sees it in Family

### Requirement: Workspace routes
The API SHALL expose `GET`/`POST /api/v1/workspaces`, `GET`/`PATCH`/`DELETE /api/v1/workspaces/{id}`, `POST .../leave`, `POST .../transfer`, `GET`/`POST .../members`, `PATCH`/`DELETE .../members/{userId}`, `DELETE .../member-invitations/{invitationId}`, `GET`/`POST .../groups`, `PATCH`/`DELETE .../groups/{groupId}`, `PUT`/`DELETE .../groups/{groupId}/members/{userId}`, and the invite routes above. All SHALL require a session or a `full` or `admin` token, apply the role rules above, return the JSON error envelope on failure, and be refused with 403 `demo_restricted` on a demo instance before authentication (except the anonymous preview, which answers 404 there). The workspace and its member list SHALL carry `pending`, the open invitations, for the owner and admins only. Project group grants SHALL go through `POST /api/v1/projects/{id}/grants` and `PATCH`/`DELETE .../grants/{groupId}` with the project's member-management rules. Every membership, role, group, invitation and transfer change SHALL be recorded as an audit event carrying ids only.

#### Scenario: List workspaces
- **WHEN** a user who owns "Personal" and "Work" and is a member of "Family" lists workspaces
- **THEN** the response lists the three with the user's role on each, each with its members and groups, the default workspace marked `default: true`

#### Scenario: Read token
- **WHEN** a `read` token posts to any workspace write route
- **THEN** the response is 403 `insufficient_scope`

#### Scenario: Demo
- **WHEN** a demo account posts to `/api/v1/workspaces`
- **THEN** the response is 403 `demo_restricted`

#### Scenario: Audit without content
- **WHEN** an admin adds Bob to a group
- **THEN** an audit event `workspace.group_member_added` is recorded with the workspace, group and user ids and never the names
