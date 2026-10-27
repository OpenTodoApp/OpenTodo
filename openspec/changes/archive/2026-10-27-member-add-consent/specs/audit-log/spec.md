## ADDED Requirements

### Requirement: Membership invitation events
The server SHALL record `member_invitation.created` when an add by email becomes an invitation, `member_invitation.accepted` and `member_invitation.declined` when the invitee answers, and `member_invitation.cancelled` when an owner or admin cancels one, each with the invitation id, the project or workspace id and the role, the acting account as actor and the other account as target when there is one. An invitation for an address without an account SHALL be recorded without a target. An accepted invitation SHALL also be recorded as `project.member_added` or `workspace.member_added` with the inviter as actor. The invited address, the project name and the workspace name SHALL never be recorded.

#### Scenario: Invitation created
- **WHEN** Alice adds the address of Dan, with whom she shares nothing, to a project
- **THEN** the log contains `member_invitation.created` with Alice as actor, Dan as target, and the invitation id, project id and role in its details, and no address or name

#### Scenario: Invitation accepted
- **WHEN** Dan accepts Alice's invitation
- **THEN** the log contains `member_invitation.accepted` with Dan as actor and Alice as target, and `project.member_added` with Alice as actor and Dan as target

#### Scenario: Unknown address
- **WHEN** Alice adds an address without an account
- **THEN** the log contains `member_invitation.created` with Alice as actor and no target
