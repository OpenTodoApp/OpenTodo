# Project invite links

## Why

The product owner wants shared todo lists: someone creates a list and invites others to work on it. Sharing exists (`project-sharing`) but only adds an account that already exists on the server, by its exact email. Inviting a new person takes two steps (a server invitation from the owner or an admin, then sharing once they have signed up), and members cannot do the first step at all. A single link that adds the person to the project with the chosen role, and creates their account when that is allowed, closes the gap.

## What Changes

- **Project invite links.** The project's owner or a project admin creates a link from the share dialog ("Invite with a link"): role viewer or editor (admin only when the creator owns the project), an optional email binding, an expiry from one hour to 30 days (default seven days). The link is single-use, its secret is shown once and only a hash is stored. The share dialog lists pending links of the project (role, bound email, expiry, creator) and revokes them.
- **Opening the link** (`/invite/p/<token>`): an anonymous preview shows the inviter's name, the project name, the role and the expiry. A signed-in person joins with one click. A person without a session can sign in and then join, or create an account and join in one step when the link may create accounts.
- **Who can bring new people.** A link creates an account only when its creator is the server owner or an admin, when open sign-up is on, or when the owner turned on the new setting **"Members can invite new people with project links"** (Settings → Administration, off by default). Otherwise the page says the person needs an account on this server first and offers only sign-in.
- **Invalidation.** Revocation, project deletion, the creator losing the right to grant the role (no longer owner or admin of the project, or deactivated) and expiry all make the link invalid. Membership changes reach devices through the existing membership sync and wake-up.
- **Limits.** 20 links per creator per hour; preview and acceptance share the sign-in limiter per client address; audit events `project_invite.created`, `project_invite.revoked`, `project_invite.accepted`; creation needs a fresh session like server invitations; read and agent tokens are refused. All project invite routes are refused on a demo instance.

## Out of scope

- Reusable (multi-use) links, links that grant ownership, and inviting to several projects with one link.
- Sending the link by email or any other channel: the server never contacts anyone; the creator copies the link.
- Changing server invitations, open sign-up, or how existing members are added by email.
- Showing project invite links in the owner's Settings → Members list (they are managed from the project's share dialog).

ROADMAP: advances **5. Collaboration** (new row "Invite links for shared projects", `project-invite-links`), building on `project-sharing` and `invitations`.

## Impact

- **Specs:** `project-sharing` (links, preview, joining, share dialog, acceptance screen), `invitations` (account creation through a project link, owner switch), `audit-log` (new events), `demo-mode` (routes refused).
- **Code:** migration `0029_project_invites.sql`; `internal/auth/projectinvites.go` (store, preview, accept, register); `internal/sync/members.go` (add a member inside a caller's transaction, project status lookup); `internal/audit/events.go`; `internal/httpapi/projectinvites.go` (routes, owner switch), `server.go` (register field), `demo.go` (deny list); web: `ShareDialog`, new `InviteLinksSection` and `ProjectInviteScreen`, router, API client, Settings → Administration toggle, audit labels.
- **API:** five routes under `/api/v1/projects/{id}/invites` and `/api/v1/project-invites/{token}`, one owner setting route, one optional field `projectInvite` on `POST /api/v1/auth/register`, error code `project_invite_not_allowed`.
- Nothing **BREAKING**: no new environment variable, no op log change, no dependency.
