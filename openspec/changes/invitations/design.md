# Design

## Context

Accounts, sessions and the closed-by-default sign-up policy exist (`account-access`). Roles are `owner` and `member`. Registration is a single unauthenticated route with a per-IP rate limiter. There is no outbound email, and adding SMTP would mean more configuration, which the self-hosting principles discourage. The invitation therefore is a link the owner copies and delivers however they like.

## Goals / Non-Goals

**Goals:**
- Owner admits one person with one link; the link works once and expires.
- Zero configuration: nothing to set up, no email delivery, works on a LAN-only server.
- Reuse the registration path so password policy, session creation and rate limiting stay in one place.

**Non-Goals:**
- Email delivery, role management, removing members, admin role, project-sharing invitations.
- Syncing invitation state to devices: invitations are account administration data, not user content.

## Decisions

### D1. Invitation secret format and storage
The secret is 256 random bits, URL-safe base64, with the prefix `oti_` so it is recognisable in logs and clipboards. The server stores `sha256(secret)` only, as it already does for sessions and API tokens. The link is `<base URL>/invite/<secret>`; when `OPENTODO_BASE_URL` is unset the link uses the request's origin so LAN installs still get a working link.
- Alternative: short human-typable codes. Rejected because low entropy forces tighter rate limiting and lockouts; the long secret is pasted, never typed.

### D2. One table, status derived from timestamps
New table `invitations(id, token_hash UNIQUE, created_by, email NULL, role DEFAULT 'member', created_at, expires_at, accepted_at NULL, accepted_by NULL, revoked_at NULL)`. Status is derived: `revoked_at` → revoked; `accepted_at` → accepted; `expires_at < now` → expired; else pending. No status column to keep in sync.
- Acceptance runs inside the registration transaction as `UPDATE invitations SET accepted_at=?, accepted_by=? WHERE token_hash=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`; zero rows affected means the invitation is not usable and the transaction rolls back. The single SQLite connection makes two concurrent acceptances serialise, so exactly one wins.

### D3. Register route gains an optional field instead of a new route
`POST /api/v1/auth/register` accepts `invitation`. Precedence in the service: no users → owner setup; invitation present → validate it, create member; else → the existing open-sign-up check. This keeps password validation, email normalisation, `email_taken` handling and session start in one code path and keeps the list of unauthenticated routes unchanged except for the preview.
- Alternative: `POST /api/v1/invitations/{token}/accept`. Rejected: duplicate registration logic and a second unauthenticated write route.

### D4. Preview is the only new unauthenticated route
`GET /api/v1/invitations/{token}` returns `{inviterName, email, expiresAt}` and nothing else. The route is registered without `requireAuth` because the invitee has no account yet; it is rate limited by the existing per-IP limiter (same 10/min window as sign-in). All failure modes map to one `invitation_invalid` 404 so an attacker cannot distinguish revoked from unknown.

### D5. Authorization check in one place
`auth.Service.CanInvite(user)` returns `user.Role == "owner"`. A future `admin` role extends this function only. Handlers call it and answer 403 `forbidden`.

### D6. Rate limits
Preview and acceptance share the login limiter keyed by client IP. Creation uses a second fixed-window limiter keyed by user id, 20 per hour, to stop a compromised owner session from minting thousands of links.

### D7. Client
- Settings gains a `MembersPanel` component rendered only when `user.role === "owner"`. It fetches `GET /api/v1/invitations` on mount, keeps the last response in component state, and disables actions when `navigator.onLine` is false or the fetch fails with a network error.
- Router gains `/invite/:token`. The screen calls the preview, renders the existing registration form with `invitation` set, and handles `invitation_invalid`, `invitation_email_mismatch`, `email_taken` and `rate_limited`.
- Keyboard: list rows are focusable, `Enter` copies the link, `Delete` revokes after a confirm.

### D8. Data model impact
Additive migration `0002_invitations.sql`. No change to `users`, `ops`, `fields`, the op schema or the sync protocol. Nothing about invitations is synced, so there is no convergence concern: the server row is the only replica.

### D9. Dependencies and footprint
No new Go or npm dependency. Binary size unchanged within noise (~10 KB of handlers and SQL); runtime memory unchanged (one small in-memory limiter map). Bundle grows by roughly 3 KB gzipped for the panel and the invite screen.

## Risks / Trade-offs

- [Link leaks in transit (chat, email)] → single use, default seven-day expiry, owner can revoke, optional email binding; the preview reveals only the inviter's name.
- [Owner session compromised mints invitations] → per-user creation limit, list shows every invitation with its creator; `audit-log` will record creation and acceptance.
- [Token guessing] → 256-bit secret, per-IP limiter, uniform 404.
- [Invitee already signed in on the device] → acceptance screen offers sign-out first; the invitation is never attached to an existing account.
- [Server without `OPENTODO_BASE_URL` behind a proxy builds a wrong link] → fall back to `X-Forwarded-Host`/`Host` as the origin check already does; docs recommend setting the base URL.

## Migration Plan

Additive migration only. Rolling back to an older binary leaves an unused table. No data migration, no client storage change.

## Open Questions

- Whether invitations should carry a note ("for the kids' tablet") shown in the list; cheap to add later as a nullable column.
