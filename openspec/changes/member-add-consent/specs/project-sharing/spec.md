## ADDED Requirements

### Requirement: Membership invitations for strangers
Adding a member by email SHALL add an account at once only when the caller and that account already share a shared project or a created workspace. Otherwise `POST /api/v1/projects/{id}/members` SHALL answer `202 {pending: true}` the same way whether or not an account has that address, SHALL store a pending invitation that expires after 14 days (for an unknown address a placeholder that never notifies anyone), and SHALL notify an existing account in the app and, with outgoing email on, by an email sent after the answer that names the inviter and the role but not the project. At most 50 invitations SHALL be open per project (409 `limit_reached`), and each add by email SHALL count against the existing hourly add limit. Asking again for an open invitation SHALL update its role without a second notification; asking again after the person declined SHALL answer 202 and store nothing until the declined invitation would have expired.

The invitee SHALL list, accept and decline their open invitations (`GET /api/v1/me/member-invitations`, `POST /api/v1/me/member-invitations/{id}/accept`, `POST /api/v1/me/member-invitations/{id}/decline`), each requiring a session or a `full` or `admin` token and refused on a demo instance. Accepting SHALL add the membership through the same path as an immediate add, with the inviter as the acting member, after checking that the inviter is active and may still grant the role on a live project; otherwise it SHALL answer 410 `invitation_stale` and drop the invitation. An id that is not one of the caller's open invitations SHALL answer 404 `not_found`. Answering or cancelling an invitation SHALL mark its notification read. Invitations are server state, never synced; answering needs a connection, and the project reaches the invitee's devices by the usual membership sync once accepted, converging like any membership change.

#### Scenario: Stranger is asked
- **WHEN** a project owner adds by email an account with which they share no project or workspace
- **THEN** the answer is 202 `{pending: true}`, the account is not a member, and it sees an invitation in its notifications and in Settings with Accept and Decline

#### Scenario: Unknown address
- **WHEN** a project owner adds an address that has no account
- **THEN** the answer is the same 202 `{pending: true}`, the pending list shows the address like any other invitation, and nobody is notified

#### Scenario: Co-member added at once
- **WHEN** a project owner adds by email an account that is already a member of another shared project of theirs
- **THEN** the answer is 201 and the account is a member, as before

#### Scenario: Accept
- **WHEN** the invitee accepts while the inviter is still an owner or admin of the project
- **THEN** the answer is 200, the invitee becomes a member with the invited role, and the project appears on their devices after the next sync

#### Scenario: Decline
- **WHEN** the invitee declines and the owner adds the same address again the next day
- **THEN** the decline answers 204, nobody becomes a member, the repeated add answers 202 and no new invitation or notification is created

#### Scenario: Stale invitation
- **WHEN** the invitee accepts after the inviter lost the admin role
- **THEN** the answer is 410 `invitation_stale` and no membership is created

#### Scenario: Someone else's invitation
- **WHEN** an account accepts or declines an invitation id that was sent to another account
- **THEN** the answer is 404 `not_found` and nothing changes

#### Scenario: Anonymous or read token
- **WHEN** a request without credentials, or with a `read` or `agent` token, calls an invitation route
- **THEN** the response is 401 `unauthorized` or 403 `insufficient_scope` and nothing changes

#### Scenario: Demo instance
- **WHEN** a demo visitor calls an invitation route
- **THEN** the response is 403 `demo_restricted`

## MODIFIED Requirements

### Requirement: Membership routes
The API SHALL expose list, add, change-role, remove and transfer routes under `/api/v1/projects/{id}/members` and `/api/v1/projects/{id}/transfer`, the cancel route `DELETE /api/v1/projects/{id}/member-invitations/{invitationId}`, and group grant routes `POST /api/v1/projects/{id}/grants` (`{groupId, role}`), `PATCH` and `DELETE /api/v1/projects/{id}/grants/{groupId}`, which follow the same role rules as adding, changing and removing a member. All of them SHALL require a valid session or API token, SHALL apply the role rules above, and SHALL return the JSON error envelope on failure. The add route SHALL answer 201 with the membership for an immediate add and 202 `{pending: true}` for an invitation (see "Membership invitations for strangers"). The member list SHALL carry, for each member, their effective role and `via`: an empty list for a direct grant alone, otherwise the ids and names of the groups the role comes from, and SHALL list the project's group grants with their roles; for owners and admins it SHALL also carry `pending`, the open invitations with their address, role and expiry, and cancelling one SHALL need the same role. Collection and export routes SHALL include the shared projects and tasks the caller is a member of, with the caller's effective role on each shared project.

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches any membership, invitation or grant route
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Non-member lists members
- **WHEN** an authenticated user who is not a member requests the member list of a project
- **THEN** the response is a 404 `not_found` error that does not reveal the project's existence

#### Scenario: Pending invitations only for managers
- **WHEN** an owner and an editor of a project with one open invitation request the member list
- **THEN** the owner's answer carries `pending` with the invited address and role, and the editor's answer carries no `pending`

#### Scenario: Cancel an invitation
- **WHEN** an admin cancels an open invitation, and an editor tries to cancel another
- **THEN** the admin gets 204 and the invitation is gone, and the editor gets 403 `forbidden`

#### Scenario: Export includes shared projects
- **WHEN** a member requests the export
- **THEN** the document includes the shared projects and their tasks, each shared project carrying the caller's role and the owner's id, alongside the caller's personal data

#### Scenario: Grant a group
- **WHEN** an admin posts `{"groupId":"<Adults>","role":"editor"}` to the project's grants route
- **THEN** the response is 201, the member list shows every member of Adults with `via` naming the group, and a group of another workspace answers 404 `not_found`

#### Scenario: Grant refused for the role
- **WHEN** an editor posts to the grants route, or an admin grants `admin` to a group
- **THEN** the editor gets 403 `forbidden`, the admin gets 403 `forbidden`, and no grant exists

### Requirement: Sharing in the client
The client SHALL mark shared projects in the sidebar, show the member list and roles from the project header, offer a share dialog to the owner and admins, and render the project read-only for viewers, all from the locally cached membership so it behaves the same offline. The share dialog SHALL list open invitations under "Waiting for an answer" with Cancel, and SHALL say after an add that became an invitation that the person gets an invitation to accept if they have an account. An invitation SHALL show in the notification list with Accept and Decline while it is unread, and in Settings → Account → Invitations while it is open. Every sharing action SHALL be reachable with the keyboard.

#### Scenario: Viewer opens a shared project offline
- **WHEN** a viewer opens the app without a network and navigates to the shared project
- **THEN** the tasks are listed, the quick-add input and edit controls are disabled with a read-only notice, and the member list still shows

#### Scenario: Share dialog with the keyboard
- **WHEN** the owner presses the share shortcut in a project view, types the email of someone they already share a project with, picks a role and confirms
- **THEN** the member is added without any mouse interaction and appears in the member list

#### Scenario: Share with a stranger
- **WHEN** the owner adds the email of someone they share nothing with
- **THEN** the address appears under "Waiting for an answer" with its role and a Cancel button, and the dialog explains that an account with that address gets an invitation

#### Scenario: Accept from the notifications
- **WHEN** the invitee opens the notification list and chooses Accept on the invitation
- **THEN** the project appears in their sidebar after the sync that follows, and the notification is read without Accept and Decline
