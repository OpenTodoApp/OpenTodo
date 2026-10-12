# Design: project invite links

## Context

`project-sharing` adds an existing account by email; `invitations` lets the server owner and admins mint single-use links that create a `member` account. Both are server-side account data outside the op log. This change joins them: one single-use link per invitee that adds the person to one project and, when allowed, creates their account first.

## D1 Separate table, same secret handling as invitations

A new table `project_invites` (migration `0028_project_invites.sql`, idempotent statements so it can be renumbered at merge time):

| column | meaning |
| --- | --- |
| `id` | link id (ULID), shown to managers, never to invitees |
| `token_hash` | SHA-256 of the secret (`hashToken`, as for invitations, sessions and tokens), unique |
| `project_id` | the project (an op-log entity, so no foreign key) |
| `created_by` | creator, `REFERENCES users ON DELETE CASCADE` |
| `email` | optional binding, normalised to lower case |
| `role` | `viewer`, `editor` or `admin` |
| `created_at`, `expires_at` | Unix ms |
| `accepted_at`, `accepted_by` | spent marker (`accepted_by` `ON DELETE SET NULL`) |
| `revoked_at` | revocation marker |

Status is derived like invitations. Secrets are `otp_` + 32 random bytes (URL-safe base64), so a secret pasted into the wrong place is recognisable. The secret is returned once in the create response and never logged: the request logger records only the method and the path pattern for the preview and accept routes (`/api/v1/project-invites/{token}` with the token redacted). Lookup is by the hash in an indexed column; comparing hashes in SQL leaks at most timing about a hash, never about the secret, and the handler additionally compares the stored hash with `crypto/subtle.ConstantTimeCompare` before using a row.

Server invitations were not extended with a `project_id` column because their list, revocation rights (owner and admins) and Settings screen are server-wide, while project links are managed per project by project roles. Sharing code paths (`hashToken`, `ids.Secret`, `normalizeEmail`, the TTL bounds and error values `ErrInvitationInvalid`, `ErrInvitationEmailMismatch`, `ErrInvitationSpent`, `ErrInvalidExpiry`) are reused.

Data model impact: one new table; no op field, no change to existing tables. Links are never synced, exported or written to the op log, so offline behaviour and convergence are unaffected; creating, listing and revoking need a connection.

## D2 Routes

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/projects/{id}/invites` | session or full token, fresh session, project owner/admin | create `{role, email?, expiresInHours?}` → 201 `{invite, link, newAccounts}` |
| GET | `/api/v1/projects/{id}/invites` | project owner/admin | pending links `{invites:[…]}` |
| DELETE | `/api/v1/projects/{id}/invites/{inviteId}` | project owner/admin | revoke → 204 |
| GET | `/api/v1/project-invites/{token}` | none | preview |
| POST | `/api/v1/project-invites/{token}/accept` | session or full token | join as the signed-in account |
| POST | `/api/v1/auth/register` | none | new field `projectInvite`: create account and join |
| GET/PUT | `/api/v1/settings/project-invites` | any signed-in / owner | the owner switch |

Creation uses `requireFresh` like server invitations and API tokens, because a link created by the owner or an admin can create an account; the web app's re-authentication dialog handles `reauth_required` on any screen. Read and agent tokens are refused by `requireAuth` on every write, including accept. The acceptance path is `/invite/p/<token>`: a separate path keeps `/invite/<token>` (server invitations) untouched and lets the app pick the screen before any request.

## D3 Rights are checked when the link is used

At creation the creator must be the project's owner or admin; an admin may grant viewer or editor, the owner also admin (the same rule as `AddMember`). At preview and acceptance the server re-checks, against current state, that the project is not deleted, that the creator's account is active and that the creator may still grant the role. Acceptance runs `AddMember`'s rule with the creator as actor inside the acceptance transaction (`sync.AddMemberTx`), so a creator who was removed, demoted to editor, or (as admin) holds an admin link after the rules changed gets the uniform `invitation_invalid`. Deactivating an account also revokes its pending project links, as it does for server invitations; deleting an account cascades.

A link to a project that is not shared yet shares it on acceptance, exactly like adding the first member by email. An end-to-end encrypted creator cannot create a link for an unshared project (`encryption_enabled`, the same refusal as sharing), and acceptance checks it again.

## D4 Joining and creating accounts

- **Signed in:** `accept` checks the binding (case-insensitive), adds the member, spends the link and records `project_invite.accepted` in one transaction. An existing member gets 409 `already_member` and the link stays pending, so it can still be forwarded to the intended person. The creator accepting their own link is "already a member".
- **New account:** `register` with `projectInvite` creates the account (role `member`), adds the membership and spends the link in one transaction, then starts a session as any registration. Account creation is allowed when the creator's server role is owner or admin, when open sign-up is on (anyone could register anyway), or when the owner switch is on; otherwise 403 `project_invite_not_allowed`. The rule is evaluated inside the transaction from the creator's current role.
- **At most once:** the database has one connection (`SetMaxOpenConns(1)`), so acceptance transactions serialise; the spend is an `UPDATE … WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now` that must affect exactly one row, otherwise the transaction rolls back with `invitation_invalid`. The membership insert has the `(project_id, user_id)` primary key as a second guard.
- **Wake-up:** after commit the server calls `NotifyMembership` with the project's audience (the same path as the member routes), so the new member's and existing members' devices sync and receive the membership and the project.

## D5 Single sign-on and sign-up policy

SSO-only mode keeps refusing password registration (`sso_required`); the preview then reports `canCreateAccount: false`, and the screen offers sign-in, which goes through the provider. Because the provider round trip leaves the page, the screen stores the token in `sessionStorage` before sign-in and the app returns to `/invite/p/<token>` once signed in. The open sign-up setting is unchanged; it only widens who can create accounts through a link (D4).

## D6 The owner switch

Settings key `project_invites.members_create_accounts` (JSON boolean, default false) in the existing `settings` table. `GET /api/v1/settings/project-invites` is readable by every signed-in account (the share dialog uses it to say whether a new link can bring new people); `PUT` is owner-only and records `settings.changed`. The switch lives in Settings → Administration for the owner. Changing it affects links already handed out, because the check runs at use time.

## D7 Limits and demo

A dedicated limiter caps creation at 20 per creator per hour. Preview and accept share the sign-in limiter per client address (10/min), like the invitation preview. On a demo instance both route prefixes are on the deny list for every method, so sandboxes cannot create links or reach each other's projects; `auth/register` is already refused there.

## D8 Audit

New catalogue names `project_invite.created`, `project_invite.revoked`, `project_invite.accepted` (past tense like `invitation.*`) with detail keys `project_invite_id`, `shared_project_id`, `project_role` and the existing `invited_email`. `project_id` is not used as a key because it is an op field name, which the audit allow-list forbids; the project name is content and is never recorded.

## D9 Client

- Share dialog: a collapsible "Invite with a link" section for owner and admins (hidden on the demo). Fields: role, email (optional), expiry select (1 hour, 1 day, 3 days, 7 days default, 14 days, 30 days). The created link appears in a read-only field with a Copy button and "This link is shown only once"; a line says whether it can create accounts. Pending links list role, email, expiry and creator with Revoke. Offline the controls are disabled with an explanation.
- Acceptance screen `ProjectInviteScreen`: the same card style as the invitation screen. States: loading, offline (retries when online), invalid, rate-limited, error, ready. Ready + signed in: "Join <project>"; on success the app syncs and opens the project. Ready + anonymous: "Sign in to join" and, when allowed, "Create an account" (the registration form with the bound email locked); otherwise a note that an account on this server is needed first.
- Settings → Administration: a switch for the owner.

## Size

About 700 lines of Go and 600 of TSX including tests; no dependency; no measurable binary or bundle size change (a few kB of minified JS).
