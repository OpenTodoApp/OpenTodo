# Adding someone by email asks them first

## Why

An internal security audit (L6) found that the owner or an admin of any project can add any account on the server by its email address, and the person is a member at once, without being asked. Three things follow:

- Anyone can push projects into other people's sidebars (unwanted sharing, spam).
- The answer tells whether an address has an account (404 `user_not_found` versus 201 with the member's name).
- It was the enabler of the task-id squatting attack (H1): the attacker did not need the victim to accept anything. H1 itself is fixed in wave 1, and wave 1 also added a per-actor limit of 30 add-by-email attempts per hour and a `project.member_added` audit event.

The limit bounds the abuse but does not give the person a say. This change makes adding an existing account by email an invitation that the person accepts or declines.

## What Changes

- `POST /api/v1/projects/{id}/members` with `{email, role}` for an account that does **not** already share a project or a workspace with the caller creates a **pending membership invitation** instead of a membership, and answers `202 {pending: true}`, the same answer whether or not an account with that address exists (no enumeration). When the account exists, it gets an in-app notification and, when outgoing email is on, an email sent after the answer so the response time tells nothing. When it does not exist, a placeholder that never notifies anyone is listed the same way until it expires, so the pending list reveals nothing either; the dialog suggests an invite link for people without an account (existing `project-invites` flow).
- Accounts that already share a project or a workspace with the caller, and adds by directory id inside a created workspace, are added at once as today (201), because they already know each other. In a project of a created workspace, an address outside the workspace answers 409 `not_in_workspace` whether or not it has an account.
- The invitee sees pending invitations in the notification inbox and in **Settings → Account → Invitations**, with **Accept** and **Decline**: `GET /api/v1/me/member-invitations`, `POST /api/v1/me/member-invitations/{id}/accept`, `POST .../decline`. Accepting adds the membership through the existing membership path (`AddMember`, `AddWorkspaceMember`), so sync, scopes and audit work as for any add.
- The share dialog lists pending invitations under the members with **Cancel**; `GET /api/v1/projects/{id}/members` returns them as `pending` to owners and admins only. `DELETE /api/v1/projects/{id}/member-invitations/{invitationId}` cancels.
- Pending invitations expire after 14 days, are limited to 50 open per project or workspace, and count against the existing 30-per-hour add-by-email limit. A declined invitation keeps the inviter from asking again until it would have expired; asking again answers the same 202.
- The same for `POST /api/v1/workspaces/{id}/members` with an email, with the pending list in the workspace's member list and `DELETE /api/v1/workspaces/{id}/member-invitations/{invitationId}`.

**BREAKING (API):** for a stranger's address, the add routes answer 202 instead of 201 and the person is not a member until they accept; an unknown address answers 202 instead of 404 `user_not_found`. The web app is updated in the same change (the `ot` CLI has no member command); external API clients that add members by email (for example automation that shares a project) must handle 202. Not breaking for the op log: membership is never an op.

Out of scope: consent for adds by directory id inside a workspace, email-only invitations to addresses without an account (already covered by project invite links), invitation messages through notification channels and web push, and blocking specific accounts.

ROADMAP: hardening of `project-sharing` and `workspaces`; no new item.

## Capabilities

### Modified Capabilities

- `project-sharing`: "Membership routes" (pending answer, pending list, cancel route), "Sharing in the client" (pending rows); new requirement "Membership invitations for strangers".
- `workspaces`: "Workspace membership and roles" (add by email follows the same rule, unknown address no longer 404), "A created workspace is a closed directory" (default workspace scenario), "Workspace routes" (invitation routes).
- `audit-log`: new requirement "Membership invitation events".

## Impact

- Migration `0049_member_invitations.sql`: `member_invitations` (id, kind project|workspace, target id, inviter, invitee user id or null, email, role, created_at, expires_at, declined_at).
- `internal/auth/memberinvitations.go` (store, expiry prune on the hourly pruner, revoked with the inviter's deactivation); `internal/sync` "already acquainted" check; `internal/httpapi/sharing.go`, `workspaces.go`, new `internal/httpapi/memberinvitations.go`; route policies, demo deny list; `internal/notify` new kind `member_invitation`; `internal/mail` new kind and template in six languages; `internal/audit` events `member_invitation.created`, `.accepted`, `.declined`, `.cancelled`.
- Web: `web/src/lib/api.ts`, share dialog and workspace members pending rows, notification item with Accept and Decline, Settings → Account → Invitations; strings in six languages; stories.
- Docs `docs/sharing.md`, `docs/roles-and-assignments.md`, `docs/workspaces.md`, `docs/settings-you.md`, `docs/api.md`; CHANGELOG (Security, and Changed with an upgrade note for API clients).
- About 44 test call sites that rely on an immediate add between unrelated test accounts accept the invitation in their helper.
