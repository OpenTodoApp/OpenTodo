# Route authorization policy, admin tokens and credential hygiene

## Why

A security audit (SEC-3, SEC-4, SEC-8, SEC-12, SEC-16) found:

- **A `full` API token was as strong as a fresh browser session.** Step-up only challenged cookie sessions, so any full token could turn off the second factor, mint more tokens and app passwords, issue reset links for members (the link comes back in the response), change roles, delete accounts and repoint single sign-on. One leaked script token was a full account takeover.
- **Single sign-on linked any account by verified email, the owner included**, and that sign-in counted as having passed the account's own second factor. Whoever controlled a provider account with the owner's email became the owner, without the owner's TOTP.
- **Owner and session checks were hand-rolled in six places and disagreed** (outgoing email refused tokens, single sign-on with its client secret accepted them), and no test looked at all ~190 registrations to see which policy each has.
- **A password reset kept remembered browsers**, so a reset did not bring back the second factor on browsers someone else may hold, and there was no way to revoke every credential at once.

## What Changes

- New API token scope **`admin`**: everything a `full` token can do, plus the credential and administration routes. Those routes (second factor and recovery codes, passkeys, creating API tokens and app passwords, unlinking an identity, the own password, invitations, user administration, two-factor resets and policy, single sign-on settings, the encryption key record, and the outgoing-email, backup and assistant settings that hold secrets) refuse `full` tokens with 403 `insufficient_scope` and accept a session (re-confirmed within ten minutes where the route already asked for that) or an `admin` token. An `admin` token can only be created from a recently confirmed session. Stored as a `read` scope row plus a marker row (migration `0036_api_token_admin`), so a downgraded server treats it as read-only. Existing tokens keep their scope.
- Every route is registered through one wrapper with a **declared policy** (anonymous with a reason, signed in, owner, owner and admins, accepted token scopes, session only, re-confirmed session, refused on a demo). The handler-level owner and session checks go away. A test fails for a route registered without a policy, pins the policy of the security-relevant routes, and checks the demo deny list against the policies.
- **Single sign-on** never links the owner, an admin, or an account with a confirmed second factor or a passkey by email alone: the callback refuses with `oidc_link_required` and nothing is written; such accounts link from Settings while signed in. An identity linked by email during a sign-in never counts as passing the account's own second factor.
- **A password reset** (self-service or administrator link) also forgets every remembered browser of the account.
- **Sign out everywhere**: `POST /api/v1/me/sign-out-everywhere` (session only, re-confirmed) ends every session, forgets remembered browsers and revokes every API token and app password of the account, recorded as `sessions.revoked`; Settings → Account → Session offers it.
- Web app: the token dialog offers **Admin** with a warning while it is chosen; the Session card offers **Sign out everywhere**; the sign-in screen explains `oidc_link_required`. Translations in all five shipped languages.

**BREAKING for scripts only:** a script that used a `full` token on a credential or administration route gets 403 `insufficient_scope` and needs an `admin` token. Reading those settings and lists, revoking tokens and app passwords and forgetting remembered browsers keep working with `full` tokens. No op log change, no new environment variable.

## Out of scope

- A scope per route group (for example "users only"); one `admin` scope is enough for self-hosted servers.
- Requiring a fresh session on credential routes that did not ask for one before (passkey registration, TOTP enrolment): sessions behave as before there; only tokens change.
- The hosted tenant's whole-server archive keeps accepting `full` tokens with a fresh session.
- `ot token create --scope admin`: the CLI cannot hold a session, so admin tokens are created in the web app.
- Advances ROADMAP items `mfa-totp`, `oidc-login`, `user-management` and `agent-ready-cli` (hardening of shipped features).
