## ADDED Requirements

### Requirement: Membership invitations for strangers
Adding a member by email SHALL add an account at once only when the caller and that account already share a project or a workspace directory. Otherwise `POST /api/v1/projects/{id}/members` SHALL answer `202 {pending: true}` the same way whether or not an account has that address, SHALL create a pending invitation that expires after 14 days, and SHALL notify an existing account in the app and, with outgoing email on, by email. The invitee SHALL list, accept and decline their pending invitations (`GET /api/v1/me/project-invitations`, `POST .../{id}/accept`, `POST .../{id}/decline`), each requiring a session or a full token and refused on a demo instance. Accepting SHALL add the membership through the same path as an immediate add, after checking that the inviter may still grant the role; otherwise it SHALL answer 410 `invitation_stale`. Owners and admins SHALL see pending invitations in the member list and cancel them. Invitations are server state, never synced; the project reaches the invitee's devices by the usual membership sync once accepted.

#### Scenario: Stranger is asked
- **WHEN** a project owner adds by email an account with which they share no project or workspace
- **THEN** the answer is 202 `{pending: true}`, the account is not a member, and it sees an invitation in its notifications with Accept and Decline

#### Scenario: Unknown address
- **WHEN** a project owner adds an address that has no account
- **THEN** the answer is the same 202 `{pending: true}` and nobody is notified

#### Scenario: Co-member added at once
- **WHEN** a project owner adds by email an account that is already a member of another project of theirs
- **THEN** the answer is 201 and the account is a member, as before

#### Scenario: Accept
- **WHEN** the invitee accepts while the inviter is still an owner or admin of the project
- **THEN** the invitee becomes a member with the invited role and the project appears on their devices after the next sync

#### Scenario: Stale invitation
- **WHEN** the invitee accepts after the inviter lost the admin role
- **THEN** the answer is 410 `invitation_stale` and no membership is created

#### Scenario: Anonymous or read token
- **WHEN** a request without credentials, or with a read or agent token, calls an invitation route
- **THEN** the response is 401 `unauthorized` or 403 `forbidden` and nothing changes
