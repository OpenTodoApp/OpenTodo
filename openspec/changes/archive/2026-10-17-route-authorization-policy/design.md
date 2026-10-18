# Design: route authorization policy

## D1. One policy per route, declared at registration

`internal/httpapi/policy.go` defines `routePolicy` and `routes.handle(pattern, policy, handler)`. Constructors read like the auth column of docs/api.md: `public(reason)`, `signedIn`, `ownerOnly(what)`, `adminsOnly(what)`, with modifiers `.credential()` (tokens need the admin scope), `.recent()` (sessions re-confirmed within `FreshWindow`), `.sensitive()` (both), `.sessionOnly()`, `.fullTokens()` and `.demoDenied()`. The zero value is invalid and registration panics, so a route cannot be added without a policy; a public route must say why. Authenticated routes are wrapped in `requireAuth` (unchanged: restricted sessions, origin check, read/agent tokens on writes) and then `admits`, which checks role first (a member is told `forbidden`, never asked to re-authenticate), then tokens, then freshness. Handlers keep only conditional checks the table cannot express (key record replacement freshness, a token minting an admin token, project roles).

`policy_test.go` builds a server with every conditional feature on and reads the recorded table: every entry has a valid policy, every pattern in the sources is in the table, no source file calls `ServeMux.Handle`/`HandleFunc` outside policy.go, a table pins ~60 security-relevant routes, and `demoRules` (still applied before routing, as prefix rules that also cover unregistered paths) must refuse exactly the routes whose policy says `demoDenied`, with every privileged write among them.

## D2. The admin scope

`admin` ⊇ `full`. Stored like `agent` (D2 of mcp-write-tools): a `read` row in `api_token_scopes` (whose CHECK stays `('full','read')`) plus a row in the new `api_token_admin`; a binary that does not know the marker sees a read-only token. `auth.FullAccess(scope)` replaces `scope == full` where "may write" is meant. `POST /api/v1/tokens` with scope `admin` is refused for any bearer token (`session_required`); the route itself is `sensitive`, so the session must be fresh. MCP write tools still need `agent`.

Which routes are credential routes: the mutating routes of the second factor, passkeys, token and app password creation, identity unlinking, own password, invitations, `/users`, two-factor policy and resets, single sign-on settings, the encryption key record, the settings that hold secrets (SMTP read and write, backups, assistant provider keys), and the hosted tenant's archive download, which holds every account's credentials. Revocations (tokens, app passwords, trusted devices) stay open to full tokens: they only remove access, and `ot logout` revokes its own token.

## D3. Single sign-on linking

`MatchOrProvision` checks, inside its transaction, whether the email-matched account is guarded (owner, admin, confirmed TOTP, any passkey) and returns `ErrLinkRequiresSession` before writing anything. The callback answers `/?error=oidc_link_required` and records `login.failed` with that reason. The callback also refuses (defence in depth) when the identity was linked in this sign-in and the account has a local factor, so a just-linked identity never stands in for it. Existing links keep signing in and keep counting as the second factor (the provider applies its own policy, mfa-totp D5).

## D4. Reset and sign out everywhere

`ResetPassword` deletes `trusted_devices` in the same transaction as the sessions. `SignOutEverywhere` deletes sessions, trusted devices and API tokens and revokes app passwords in one transaction with one `sessions.revoked` event (counts only). The handler closes the account's event streams and clears the session and trust cookies. Session only and fresh: an API token must not be able to sign its person out, and a stale stolen session must not revoke every script.

## Data model impact

Migration `0036_api_token_admin` adds one side table keyed by token id (cascade delete). No op, no synced field. Audit catalogue: `sessions.revoked` with `session_count`, `device_count`, `token_count`, `app_password_count`.

## Size and memory

No dependency. A few hundred lines of Go; the route table is ~190 small structs. Web: one dialog row and one notice, no new module.

## Interface budget

Settings → Account → Session gains one row (Sign out everywhere) inside the existing card; the token dialog gains one option and a conditional notice. No new chrome rows above a list, no new scroll region, no shortcut.
