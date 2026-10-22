## MODIFIED Requirements

### Requirement: Project membership and roles
A project SHALL have exactly one `owner` and any number of members with the role `viewer`, `editor` or `admin`. A member's role SHALL come from a direct grant, from a grant to a group of the project's workspace they belong to, or from both, the highest role winning. The owner and admins SHALL be able to add an existing account as a member with a chosen role and to change a member's role, and to grant a group of the project's workspace a role. In a project of the account's default workspace an account is named by its exact email; in a project of a created workspace only members of that workspace may be added, named from the workspace's directory, and only its groups may be granted. Membership SHALL be visible to every member of the project, with the source of each member's role (direct, or the groups it comes from), and SHALL be cached on each device so it is available offline; a device SHALL adopt the server's membership on every sync so all devices converge on the same member list.

#### Scenario: Share with an existing account
- **WHEN** the owner adds `bob@example.com`, an existing account, as `editor` to a project in their default workspace
- **THEN** the project lists Bob as an editor, every member sees him in the member list after their next sync, and Bob's devices receive the project on their next sync

#### Scenario: Unknown email
- **WHEN** a member is added by an email that has no account on this server
- **THEN** the request is refused with a 404 `user_not_found` error, no invitation is created, and the response does not reveal any other account's email

#### Scenario: Role change while the member is offline
- **WHEN** an admin changes Bob from `editor` to `viewer` while Bob's device is offline
- **THEN** Bob's device keeps showing the project read-write until it syncs, and after the sync it shows the project read-only with the viewer role

#### Scenario: Outside the workspace
- **WHEN** the owner of a project in the created workspace "Work" adds an account that is not a member of Work
- **THEN** the request is refused with 409 `not_in_workspace` and nobody is added

#### Scenario: Role through a group
- **WHEN** the group "Adults" is granted `editor` on "House" and Carol, a member of Adults, has no direct grant
- **THEN** Carol is an editor of House, the member list shows her role as coming from Adults, and her devices receive the project on their next sync

### Requirement: Membership routes
The API SHALL expose list, add, change-role, remove and transfer routes under `/api/v1/projects/{id}/members` and `/api/v1/projects/{id}/transfer`, and group grant routes `POST /api/v1/projects/{id}/grants` (`{groupId, role}`), `PATCH` and `DELETE /api/v1/projects/{id}/grants/{groupId}`, which follow the same role rules as adding, changing and removing a member. All of them SHALL require a valid session or API token, SHALL apply the role rules above, and SHALL return the JSON error envelope on failure. The member list SHALL carry, for each member, their effective role and `via`: an empty list for a direct grant alone, otherwise the ids and names of the groups the role comes from, and SHALL list the project's group grants with their roles. Collection and export routes SHALL include the shared projects and tasks the caller is a member of, with the caller's effective role on each shared project.

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches any membership or grant route
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Non-member lists members
- **WHEN** an authenticated user who is not a member requests the member list of a project
- **THEN** the response is a 404 `not_found` error that does not reveal the project's existence

#### Scenario: Export includes shared projects
- **WHEN** a member requests the export
- **THEN** the document includes the shared projects and their tasks, each shared project carrying the caller's role and the owner's id, alongside the caller's personal data

#### Scenario: Grant a group
- **WHEN** an admin posts `{"groupId":"<Adults>","role":"editor"}` to the project's grants route
- **THEN** the response is 201, the member list shows every member of Adults with `via` naming the group, and a group of another workspace answers 404 `not_found`

#### Scenario: Grant refused for the role
- **WHEN** an editor posts to the grants route, or an admin grants `admin` to a group
- **THEN** the editor gets 403 `forbidden`, the admin gets 403 `forbidden`, and no grant exists

### Requirement: Memberships in a fixed number of queries
Listing a user's shared projects with their members, which every sync exchange does, SHALL take a fixed number of queries however many projects, workspaces or groups the user belongs to, and SHALL return the same projects and members in the same order (projects by id, members owner first, then by role and email). Effective membership (direct grants combined with group grants) SHALL be materialised on the server whenever a grant, a group or a workspace membership changes, in the same transaction, so that reading it, checking an operation, waking devices and listing assignable members never evaluate groups at read time. Membership is server-side data; nothing changes for offline devices, which receive the list on their next sync as before.

#### Scenario: Member of many projects
- **WHEN** a user who belongs to 20 shared projects syncs
- **THEN** their memberships are read with two queries, not one per project

#### Scenario: Member of none
- **WHEN** a user who belongs to no shared project syncs
- **THEN** the membership list is empty

#### Scenario: Group change is materialised once
- **WHEN** Dan is added to a group that is on 30 projects
- **THEN** his 30 effective memberships are written in that request's transaction, and his next sync reads them with the same two queries as any other member
