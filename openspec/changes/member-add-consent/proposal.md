# Adding someone by email asks them first

## Why

An internal security audit (L6) found that the owner or an admin of any project can add any account on the server by its email address, and the person is a member at once, without being asked. Three things follow:

- Anyone can push projects into other people's sidebars (unwanted sharing, spam).
- The answer tells whether an address has an account (404 `user_not_found` versus 201 with the member's name).
- It was the enabler of the task-id squatting attack (H1): the attacker did not need the victim to accept anything. H1 itself is fixed in wave 1, and wave 1 also added a per-actor limit of 30 add-by-email attempts per hour and a `project.member_added` audit event.

The limit bounds the abuse but does not give the person a say. This change makes adding an existing account by email an invitation that the person accepts or declines.

## What Changes

- `POST /api/v1/projects/{id}/members` with `{email, role}` for an account that does **not** already share a project or a workspace with the caller creates a **pending membership invitation** instead of a membership, and answers `202 {pending: true}`, the same answer whether or not an account with that address exists (no enumeration). When the account exists, it gets an in-app notification (and an email when outgoing email is on). When it does not exist, a placeholder that never notifies anyone is listed the same way until it expires, so the pending list reveals nothing either; the dialog suggests an invite link for people without an account (existing `project-invites` flow).
- Accounts that already share a project or a workspace with the caller, and adds by directory id inside a created workspace, are added at once as today (201), because they already know each other.
- The invitee sees pending invitations in the notification inbox and in **Settings → Account → Invitations**, with **Accept** and **Decline**. `GET /api/v1/me/project-invitations`, `POST /api/v1/me/project-invitations/{id}/accept`, `POST .../decline`. Accepting adds the membership through the existing membership path (`AddMember`), so sync, scopes and audit work as for any add.
- The share dialog lists pending invitations under the members with **Cancel**; `GET /api/v1/projects/{id}/members` returns them as `pending` to owners and admins only. `DELETE /api/v1/projects/{id}/invitations/{inviteId}` cancels.
- Pending invitations expire after 14 days, are limited to 50 per project, and count against the existing 30-per-hour add-by-email limit.
- The same for `POST /api/v1/workspaces/{id}/members` with an email.

**BREAKING (API):** for a stranger's address, the add route answers 202 instead of 201 and the person is not a member until they accept. The web app, the `ot` CLI and documented scripts are updated in the same change; external API clients that add members by email (for example automation that shares a project) must handle 202. Not breaking for the op log: membership is never an op.

Out of scope: consent for adds by directory id inside a workspace, email-only invitations to addresses without an account (already covered by project invite links), and blocking specific accounts.

ROADMAP: hardening of `project-sharing` and `workspaces`; no new item.

## Why this stops at the proposal

Wave 2 delivers small hardening patches. This one is a feature: a new server table and routes, a notification kind, UI in the inbox, Settings and the share dialog with Storybook baselines and strings in six languages, a changed success code on a public route, and updates to about 44 test call sites that rely on an immediate add. The risk that justified urgency (H1) is fixed, and the remaining abuse is rate-limited and audited since wave 1. It should be scheduled and implemented as its own change (`/opsx:apply member-add-consent`) after review of this proposal, in particular of the exemption rule and the 202 answer.

## Capabilities

### Modified Capabilities

- `project-sharing`: "Membership routes" (pending answer, pending list), "Sharing in the client" (pending rows); new requirement "Membership invitations for strangers".
- `workspaces`: member add by email follows the same rule (delta to be written with the implementation).

## Impact

- Migration: `member_invitations` (id, kind project|workspace, target id, inviter, invitee user id, role, created_at, expires_at, answered_at, answer).
- `internal/httpapi/sharing.go`, `workspaces.go`, new `internal/httpapi/member_invitations.go`; `internal/notify` new kind; `internal/audit` events `project.member_invited`, `project.invitation_answered`.
- Web: `web/src/lib/api.ts`, share dialog, inbox item, Settings → Account → Invitations; strings; stories.
- `internal/cli` share command; docs `docs/sharing.md`, `docs/api.md`; CHANGELOG.
