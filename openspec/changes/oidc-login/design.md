# Design

## Context

Identity today is local: password, sessions, API tokens, roles `owner`/`member`. Configuration is environment-only and must remain optional. The server makes no outbound requests. Adding OpenID Connect means the server talks to one owner-chosen issuer, must verify signed tokens, and must integrate with the existing sign-up policy and session layer. Passkeys (`passkeys`) and invitations (`invitations`) are being planned in parallel; this design keeps the session layer and the "who may register" decision in the same single places so the three compose.

## Goals / Non-Goals

**Goals:**
- Works with any standards-compliant provider using only discovery, authorization code with PKCE, and identity-token verification.
- Zero required configuration; configurable entirely from the owner's Settings; environment variables as an optional, infrastructure-as-code path.
- Never create a path to an existing account that the account's owner did not prove (verified email only, subject-first matching).
- SSO-only mode that cannot lock the owner out.

**Non-Goals:**
- Multiple providers, SAML, group/role mapping, SCIM, provider-initiated logout, OAuth2-only providers without discovery.

## Decisions

### D1. Standard library only
`internal/oidc` implements discovery (`<issuer>/.well-known/openid-configuration`), PKCE (S256), the code exchange with `client_secret_post`/basic auth, JWKS fetch with caching and refresh on unknown `kid`, and identity-token verification for RS256, PS256, ES256 and EdDSA with `crypto/rsa`, `crypto/ecdsa`, `crypto/ed25519`. JWT parsing is ~150 lines over `encoding/base64` and `encoding/json`. Outbound requests use a dedicated `http.Client` with a 10-second timeout and redirects disabled, and only ever target hosts named in the discovery document of the configured issuer.
- Alternatives: `github.com/coreos/go-oidc` + `golang.org/x/oauth2` (+~1.5 MB, pulls in `square/go-jose`); rejected for footprint since the needed subset is small and well specified.
- Footprint: estimated binary +~60 KB; measured +~140 KB (see Implementation notes); memory: one cached discovery document and key set.

### D2. A server-side `settings` table for owner configuration
New table `settings(key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`. Keys: `oidc.issuer`, `oidc.client_id`, `oidc.client_secret`, `oidc.display_name`, `oidc.scopes` (default `openid email profile`), `oidc.allow_provision`, `oidc.sso_only`, `oidc.provider_logout`. Environment variables, when set, override the stored value and are reported as `managedBy: "env"` so the UI locks the field. The client secret lives in the data directory like every other secret-bearing hash; it is never returned by the API (masked as `••••` plus last 4 characters). This table is deliberately generic: `mfa-totp` and `audit-log` will use it for their policies.
- Alternative: env-only configuration. Rejected: it forces a redeploy for a Settings-grade change and contradicts "no configuration needed".

### D3. Identity storage and matching order
New table `identities(id, user_id, issuer, subject, email, created_at, last_login_at, UNIQUE(issuer, subject))`. Matching order on callback: (1) `(issuer, subject)` → sign in; (2) `email_verified == true` and email matches a user → insert identity, sign in; (3) provisioning allowed → create member + identity; (4) refuse. The email in the token is never used to re-match once a link exists, so an email change at the provider cannot hijack another account.

### D4. Flow state in a short-lived cookie
`start` generates `state`, `nonce`, PKCE verifier and a `mode` (`login` or `link` when a session is present) and stores them in an HttpOnly, `SameSite=Lax`, 10-minute cookie signed with HMAC over a per-process random key (lost on restart, which only aborts in-flight logins). The callback validates and clears it. Nothing is stored server-side per attempt, so there is no table to garbage-collect.
- Alternative: server-side state table. Unnecessary writes; the cookie approach is the standard one and survives multi-tab use because each tab gets its own state value in the same cookie jar (last writer wins, which matches browser behaviour).

### D5. Redirect URI and the base URL
Redirect URI is `<OPENTODO_BASE_URL>/api/v1/auth/oidc/callback`. The owner sees the exact value in the Settings panel to paste into the provider. When `BASE_URL` is unset the server falls back to the request origin, but the panel warns that providers reject mismatches; docs recommend setting it. SSO requires https in practice, which the self-hosting docs already assume for cookies and passkeys.

### D6. SSO-only enforcement in one place
`auth.Service.LocalLoginAllowed(user)` returns false when `oidc.sso_only` is on and `user.Role != "owner"`. Password and passkey sign-in call it after verifying credentials and answer 403 `sso_required`. The owner exception is the break-glass; `audit-log` will record owner local sign-ins while the mode is on. Bearer tokens bypass it by design (they are already a delegated credential).

### D7. Logout
`POST /api/v1/auth/logout` behaviour is unchanged. The response gains an optional `redirect` URL (provider end-session endpoint with `post_logout_redirect_uri` and, when available, the stored `id_token_hint`) only when `oidc.provider_logout` is on. The client follows it after the local session is gone. The identity-token hint is kept in the session row (`id_token` column, nullable) to make RP-initiated logout work; it is deleted with the session.

### D8. Client
- Sign-in screen: reads `status.oidc = {enabled, displayName, ssoOnly}`; renders the provider button as a plain link to `/api/v1/auth/oidc/start`; hides the password form when `ssoOnly` unless `?owner=1` is present (documented break-glass URL); displays `?error=oidc_failed|signup_closed|oidc_email_unverified` from the callback redirect.
- Settings: owner `SsoPanel` (form, test button, redirect URI display, env-managed lock icons); every user `LinkedAccountsPanel` (list, link, unlink). Both read-only offline. Keyboard reachable. Roughly +5 KB gzipped, no npm dependency.

### D9. Data model impact
Additive migrations: `settings`, `identities`, `sessions.id_token NULL`. No change to `ops`, `fields` or the op schema; nothing is synced; no convergence concern. Deleting a user cascades to identities.

## Risks / Trade-offs

- [Token verification mistakes in hand-written JWT code] → strict allowlist of algorithms, `alg: none` rejected, `kid` required, issuer/audience/exp/nonce checked, tests with vectors from two public providers and negative cases.
- [Account takeover via email claim] → subject-first matching, verified email required, no re-matching once linked, `identity_taken` on conflicts.
- [Owner locked out by SSO-only + broken provider] → owner exempt, break-glass URL documented, env override `OPENTODO_OIDC_SSO_ONLY=false` documented as the emergency switch.
- [Outbound requests from a server that promised none] → only to the configured issuer, only when configured, stated in SECURITY.md and the proposal.
- [Client secret at rest in SQLite] → same trust boundary as the data directory; documented; future encrypted-settings change can wrap it.
- [Provider clock skew] → 60-second leeway on `exp`/`iat`.

## Migration Plan

Additive migrations; a rollback leaves unused tables and a nullable column. Feature dormant until configured. Removing the configuration disables the routes; identities remain for re-enabling.

## Implementation notes

Recorded while applying the change; they refine the decisions above without changing the behaviour the spec describes.

- **Measured footprint.** Stripped `linux/amd64` server binary, both builds embedding the same web bundle size class: 14,811,298 → 14,966,946 bytes (+152 KB, of which ~12 KB is the larger embedded bundle; ~140 KB Go code: `internal/oidc`, the RSA-PSS/ECDSA/Ed25519 verification paths and JSON types). Web bundle: main chunk 693,935 → 706,513 bytes raw, 203,603 → 207,152 bytes gzip (+3.5 KB gzipped). No Go or npm dependency added. Runtime memory: one discovery document, one key set and a map of consumed `state` values bounded by the 10-minute flow lifetime.
- **Settings table and secret (D2).** The shared `settings` table already existed (created by earlier migrations); `0014_oidc.sql` keeps an idempotent `CREATE TABLE IF NOT EXISTS` for it. The `oidc.*` keys hold JSON values through `internal/settings.Store`. The client secret is **not** stored in the table: following `internal/settings`, server secrets live in `<data>/secrets/oidc.json` (0600 in a 0700 directory), so database snapshots and backup archives never contain it. Environment overrides and `managedBy` are implemented in `internal/oidc` (`Service.Config`), not `internal/store`; `TestSettingsEnvOverride` lives there. Environment variables: `OPENTODO_OIDC_ISSUER`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_DISPLAY_NAME`, `_SSO_ONLY`.
- **`sessions.id_token` (D7, D9).** SQLite has no idempotent `ADD COLUMN`, and migrations must survive re-runs, so the hint lives in a one-to-one side table `session_oidc(token_hash → sessions ON DELETE CASCADE, id_token)`, the same pattern as `session_auth` from `mfa-totp`. Only sessions started through the provider have a row; provider sign-out is offered only to them (a password session is never sent to the provider).
- **Single-use state (D4).** Besides the signed cookie, consumed `state` values are remembered in memory until they expire, so a captured callback URL plus cookie cannot be replayed within the ten minutes. A restart forgets them, which is harmless because the HMAC key is also per process.
- **Browser-friendly errors.** The callback answers the spec's JSON errors (`400 oidc_state_invalid`, `409 identity_taken`) to API clients; a browser navigation (`Accept: text/html`) is redirected to `/?error=<code>` or `/settings?error=<code>` so nobody sees raw JSON. Other failures always redirect with `oidc_failed`, `oidc_email_unverified` or `signup_closed`; the failure detail goes only to the server log and a `login.failed` audit reason.
- **Link mode doubles as re-authentication.** Completing the flow from a signed-in browser for an identity already linked to that account marks the session fresh (and second-factor satisfied). Accounts provisioned through the provider have no password, so this is how they pass `requireFresh` routes (e.g. creating an API token) besides a TOTP code. The web app does not yet offer it from the re-authentication dialog; Settings → Linked accounts → "Link …" works.
- **SSO-only scope.** `LocalLoginAllowed` is enforced in password sign-in, passkey sign-in and password registration (including invitation acceptance), so open sign-up or an invitation link cannot create a password account that bypasses the mode. SSO-only only takes effect while a provider is configured, so clearing the issuer can never lock members out. The owner's local sign-ins remain ordinary `login.succeeded` events (method `password`/`passkey`).
- **Two-factor (task 5.1).** The callback issues the session through `issueSession(w, r, u, true)`, the cookie-only half of `startSession(..., true)` (the callback redirects instead of answering JSON), so `mfa_at` is set and an enrolled account is not asked for a code. The owner's enrolment policy (`mfa.required`) still restricts a session whose account has no confirmed authenticator, exactly as for passkey sessions; we chose not to exempt provider sessions so the owner's explicit policy keeps meaning "every account has an authenticator". `PUT /api/v1/settings/oidc` is wrapped in `requireFresh`.
- **Tests vectors.** No live tokens from public providers are used (they expire and need network). `TestVerifyIDTokenVectors` signs positive and negative vectors in-process for all four algorithms (including HS256 key confusion and `alg: none`), and `TestRFC8037Ed25519Vector` checks the published RFC 8037 A.4 signature.

## Open Questions

- Whether group claims should map to a future `admin` role once roles exist beyond owner/member.
- Whether invitations should be redeemable through the provider flow (`/invite/<token>` → "Continue with SSO") in a follow-up.
