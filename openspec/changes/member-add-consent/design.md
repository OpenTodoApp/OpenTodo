# Design: member-add-consent

## Context

Membership is server state, changed only by the membership routes (`sync.AddMember`, `sync.AddWorkspaceMember` and friends), never by ops. Project invite links (`project_invites`, `/invite/p/<secret>`) already let someone join by accepting a secret link, optionally bound to an email. They are built for people who may not have an account and receive the link out of band. For an existing account the app can do better: the person is signed in and can answer in the app.

## D1. Who is asked

The add is immediate when the caller and the target already share at least one shared project membership (any role, direct or through a group) or one created workspace, or when the target is named by directory id in a created workspace. Otherwise it becomes a pending invitation. Reason: people who already work together expect today's behaviour, and the abuse needs a stranger. The check is one query over `project_members` and `workspace_members` (a default workspace never has a second member, so it never counts).

In a project of a created workspace the directory rule comes first: an address that is not in the directory answers 409 `not_in_workspace` whether or not an account has it (before this change an unknown address answered 404 there, which told the two apart), and a directory member always shares that workspace with the caller, so it is added at once.

Rejected: always asking. It would add a step to every family or team share, for no security gain between people who already share.

## D2. No enumeration

For a stranger, the route answers `202 {pending: true}` whether the address has an account or not, and the pending list shown to owners and admins lists the address either way: for an unknown address the row is stored as a placeholder with a null invitee that never notifies anyone and expires like the others. Nothing distinguishes the two until the person answers. The dialog says "If someone has this address on this server, they get an invitation to accept. To invite someone without an account, use an invite link."

The invitation row is stored in line for both cases, and for an existing account so is its in-app notification (one more insert, so it exists before the person can answer); the email is sent after the answer, on the server's background group, as the password reset does since the reset-timing fix, so a slow SMTP server cannot tell which addresses have accounts. Asking again for an address with an open invitation updates its role and answers 202 without a second notification. Asking again after a decline answers 202 and stores nothing until the declined row expires, so a person who said no is not asked again for 14 days.

Errors that existed before keep their meaning and reveal nothing new: 409 `already_member` names someone already on the member list, 400 for the caller's own address.

## D3. Storage

`member_invitations(id TEXT PK, kind TEXT CHECK(kind IN ('project','workspace')), target_id TEXT, inviter_id TEXT REFERENCES users ON DELETE CASCADE, invitee_id TEXT NULL REFERENCES users ON DELETE CASCADE, email TEXT, role TEXT, created_at INTEGER, expires_at INTEGER, declined_at INTEGER NULL)`, unique on `(kind, target_id, email)`. A row is open while `declined_at` is null and `expires_at` is in the future. Accepting and cancelling delete the row; declining sets `declined_at`. Expired rows are deleted on the existing hourly pruner (`audit.Recorder.AlsoPrune`, and the host scheduler's tick). `target_id` names a project (an op-log entity, no foreign key, as `project_invites`) or a workspace; a deleted project or workspace makes the invitation stale (D4) and it expires. Deactivating the inviter deletes their open invitations, as it revokes their invite links. At most 50 open rows per target (409 `limit_reached`).

## D4. Accept and decline

`POST /api/v1/me/member-invitations/{id}/accept` adds the membership as the inviter, after re-checking that the inviter is active and still owner or admin with the right to grant the role, that the project or workspace is live and, for a project that is not shared yet, that the inviter has no end-to-end encryption; otherwise it answers 410 `invitation_stale` and deletes the invitation. The add itself is `AddMember` / `AddWorkspaceMember` with the inviter as actor, so every existing rule applies (a created workspace's directory, the project-id squat check); their refusals answer 410 as well, except `already_member` (409). On success: 200 `{kind, targetId, role}`, the audience's devices are woken and the membership arrives with the next sync.

Decline sets `declined_at` and answers 204. Both answer 404 `not_found` for an id that is not the caller's open invitation. Both routes, and the list, are `signedIn.FullTokens().DemoDenied()`: `read` and `agent` tokens are refused (403 `insufficient_scope`), and a demo instance answers 403 `demo_restricted`. Accept does not need a recent sign-in: joining a project grants nothing outside it.

Cancel (`DELETE /api/v1/projects/{id}/member-invitations/{invitationId}`, and the workspace twin) needs the owner or admin role on the target, like adding; it deletes the row and answers 204.

## D5. Notifications

A new notify event kind `member_invitation` in the in-app inbox, through an optional sink interface `notify.InvitationSink` (as `notify.MentionSink` does), emitted through the sync service's sinks. Its payload carries the invitation id, the kind, the target's id and name (a project name through `e2ee.Display`), the inviter's id and name, and the role. Answering or cancelling an invitation marks its notification read on the server. The inviter's add wakes the invitee's devices with a membership wake-up, and the web client refreshes its notifications on such a wake-up (today it refreshes only after receiving ops).

An email of the new kind `member_invitation` goes through `mail.Service.Send` when outgoing email is on and the server has a base URL; like the project invite message it names the inviter and the role, never the project (its name is content), and links to Settings → Account → Invitations. Notification channels and web push are not used: neither handles membership events today.

## D6. Clients

- Web: the share dialog handles 202 (reloads the member list, shows the address under "Waiting for an answer" with Cancel, and says what happens); the workspace members card does the same. The notification list shows an invitation with Accept and Decline while it is unread. Settings → Account gets an "Invitations" sub-page that lists open invitations with Accept and Decline. All keyboard reachable; interface budget unchanged: the rows live inside existing dialogs, lists and the settings overview (no new chrome above a list, no new sidebar destination, no new scroll region, no new shortcut).
- CLI: the `ot` CLI has no member command, so nothing changes there.
- Third-party clients: documented as a BREAKING API change in the CHANGELOG with an upgrade note.

## Data model

One table, no op field, nothing synced. Membership still changes only through `AddMember` / `AddWorkspaceMember`. Offline: invitations are server state, so answering one needs a connection, as every membership change does; the notification that announces it is cached with the other notifications and shows offline.

## Size and memory

No dependency. One table with at most 50 open rows per project or workspace; six small plain-text templates. No measurable effect on image size or memory.

## Tests

- Stranger add answers 202 for existing and unknown addresses alike, and the pending list looks the same; nothing changes in membership until accept.
- Co-member add stays 201; a created workspace's outsider answers 409 for both kinds of address.
- Accept adds the member and sync delivers the project; decline adds nothing and blocks a repeat; a stale inviter answers 410; another account's id answers 404.
- Rate limit shared with today's add-by-email limit; the 50 cap; demo deny list entries; policy test pins the new routes; route matrix and API docs tests cover them.
- Web: share dialog pending state and cancel, notification accept, Settings list; stories.
