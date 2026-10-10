# Proposal

## Why

Today a server has exactly two ways to gain a second account: the operator sets `OPENTODO_ALLOW_SIGNUP=true`, which lets anyone who can reach the URL register, or the owner never adds anyone. Households and small teams need the middle ground: the owner hands one person one link, that person creates an account, and the door closes again. Invitations make "add my partner / my colleague" a settings action instead of a redeploy, and they keep the server closed to the public by default.

## What Changes

- A new `invitations` capability: the owner creates single-use, expiring invitation links from Settings, optionally bound to one email address; lists pending, accepted, expired and revoked invitations; and revokes any pending one.
- An unauthenticated, rate-limited preview route lets the invitee's client show who invited them and which email the invitation is bound to before they fill in the form.
- Registration accepts an invitation token as a third way to create an account, alongside first-run setup and open sign-up. Accepting is atomic: an invitation can create exactly one account, after which it is spent.
- New authenticated API routes `GET/POST /api/v1/invitations` and `DELETE /api/v1/invitations/{id}` (owner only), a public `GET /api/v1/invitations/{token}` preview, and an optional `invitation` field on `POST /api/v1/auth/register`.
- Rate limits: invitation creation per user, preview and acceptance per client address.
- The modified `account-access` "Sign-up policy" requirement states that a valid invitation bypasses the closed sign-up policy for one account.

Out of scope: sending the invitation by email (no outbound mail in this change; the owner copies the link), an `admin` role (today only `owner` can invite; the permission check is a single place so a future role can be granted it), project-level sharing invitations (`project-sharing`), member removal and role changes (a later `member-management` change), and self-service password reset.

This change advances ROADMAP.md section 7, "Invitations for new members".

No new mandatory environment variable and no change to the op-log format. Invitations are account data stored only on the server; they never enter the sync log.

## Capabilities

### New Capabilities
- `invitations`: creating, previewing, accepting, listing and revoking single-use invitation links, with the rate limits that protect each step.

### Modified Capabilities
- `account-access`: the "Sign-up policy" requirement gains a third path to registration: a valid, unspent invitation.

## Impact

- Server: new `invitations` table (additive migration), new methods in the auth service, five handler registrations in the router, the register handler reads an optional field, the per-IP rate limiter is reused for preview and acceptance, and a per-user limiter is added for creation.
- Web app: a "Members" section in Settings visible to the owner, an `/invite/<token>` route that renders the acceptance form, and the API client functions for the new routes.
- Docs: `docs/api.md` gains the routes; `README.md` and `docs/self-hosting/*.md` describe inviting instead of opening sign-up.
- Dependencies: none added. Binary and bundle size change is negligible (a few KB of handlers and one settings panel).
