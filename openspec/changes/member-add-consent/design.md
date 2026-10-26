# Design: member-add-consent

## Context

Membership is server state, changed only by the membership routes (`sync.AddMember` and friends), never by ops. Project invite links (`project_invites`, `/join/<secret>`) already let someone join by accepting a secret link, optionally bound to an email. They are built for people who may not have an account and receive the link out of band. For an existing account the app can do better: the person is signed in and can answer in the app.

## D1. Who is asked

The add is immediate when the caller and the target already share at least one project membership (any role) or one workspace directory, or when the target is named by directory id in a created workspace. Otherwise it becomes a pending invitation. Reason: people who already work together expect today's behaviour, and the abuse needs a stranger. The check is one query over `project_grants`/`project_members` and workspace membership.

Rejected: always asking. It would add a step to every family or team share, for no security gain between people who already share.

## D2. No enumeration

For a stranger, the route answers `202 {pending: true}` whether the address has an account or not. Nothing is stored for an unknown address (so nothing can be listed later), and the dialog says "If someone has an account with this address, they get an invitation to accept. To invite someone without an account, use an invite link." The pending list shown to owners and admins contains only invitations to existing accounts, so it reveals existence to them, after the fact. To avoid that, the pending row is stored for unknown addresses too, as a placeholder with a null invitee that never notifies anyone and expires like the others. It is listed the same way.

## D3. Storage

`member_invitations(id TEXT PK, kind TEXT CHECK(kind IN ('project','workspace')), target_id TEXT, inviter_id TEXT, invitee_id TEXT NULL, email TEXT, role TEXT, created_at INTEGER, expires_at INTEGER, answered_at INTEGER NULL, answer TEXT NULL)`, unique on `(kind, target_id, email)` while unanswered. Deleted with the project, the workspace or either account. Expiry 14 days; pruned by the existing invitation sweep.

## D4. Accept and decline

`POST /api/v1/me/project-invitations/{id}/accept` runs `AddMember` as the inviter, after re-checking that the inviter is still owner or admin of the project and that the role is still allowed; otherwise it answers 410 `invitation_stale` and marks the invitation answered. Decline marks it answered. Both are `signedIn.fullTokens()` and `.demoDenied()`; read and agent tokens are refused. Accept does not need a recent sign-in: joining a project grants nothing outside it.

## D5. Notifications

A new notify event kind `project_invitation` in the in-app inbox (through an optional sink interface, as `notify.MentionSink` does), with Accept and Decline buttons; an email through `mail.Service.Send` with a new template when outgoing email is on. Push follows the user's existing notification settings.

## D6. Clients

- Web: the share dialog handles 202 (shows the row under "Waiting for an answer" with Cancel); the inbox item; Settings → Account → Invitations. All keyboard reachable; interface budget unchanged (rows inside existing dialogs and lists).
- CLI: `ot project share` prints "Invitation sent" on 202.
- Third-party clients: documented as a BREAKING API change in the CHANGELOG.

## Data model

One table, no op field, nothing synced. Membership still changes only through `AddMember`.

## Size and memory

No dependency. One table with at most 50 open rows per project.

## Tests

- Stranger add answers 202 for existing and unknown addresses alike; nothing changes in membership until accept.
- Co-member add stays 201.
- Accept adds the member and sync delivers the project; decline and expiry add nothing; a stale inviter answers 410.
- Rate limit shared with today's add-by-email limit; demo deny list entries; policy test pins the new routes.
- Web: share dialog pending state, inbox accept, Settings list; stories and baselines.
