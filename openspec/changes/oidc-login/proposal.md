# Proposal

## Why

People who self-host usually already run an identity provider: a home-lab SSO, a company directory, or a hosted login service. Managing a separate password per application is the thing they are trying to escape. Single sign-on through a generic OpenID Connect provider lets the owner plug OpenTodo into whatever they already use, gives members one login for everything, and allows an "SSO only" posture where the provider's policies (MFA, device checks, offboarding) apply to OpenTodo automatically.

## What Changes

- A new `oidc-login` capability. The owner configures one generic OpenID Connect provider (discovery URL, client id, client secret, display name) in Settings, or through optional `OPENTODO_OIDC_*` environment variables that pre-fill and lock those fields. The feature is off until configured.
- A "Sign in with <provider>" action on the sign-in screen runs the authorization-code flow with PKCE, `state` and `nonce`; the server verifies the identity token against the provider's published keys and starts an ordinary session.
- Account linking: a returning identity signs into its linked account; a first-time identity whose verified email matches an existing account is linked to it; otherwise an account is provisioned just in time only when the sign-up policy allows it (open sign-up or the owner's "allow new accounts via SSO" toggle). Users can link and unlink the provider from Settings.
- Optional "SSO only" mode: members must use the provider; the owner keeps local credentials as break-glass; API tokens are unaffected.
- Logout stays local by default; the owner can enable redirecting to the provider's end-session endpoint.
- New routes: unauthenticated `GET /api/v1/auth/oidc/start` and `GET /api/v1/auth/oidc/callback` (rate limited), owner-only `GET/PUT /api/v1/settings/oidc` and `POST /api/v1/settings/oidc/test`, and per-user `GET/DELETE /api/v1/me/identities`. A server-side `settings` table is introduced for owner-managed configuration and will be reused by later security changes.

Out of scope: multiple providers at once, SAML, OAuth2 providers without OpenID Connect discovery, group-to-role mapping, back-channel or front-channel logout initiated by the provider, provisioning through SCIM, and using OpenTodo itself as a provider.

This change advances ROADMAP.md section 7, "OIDC / OAuth2 single sign-on".

No new mandatory environment variable: the `OPENTODO_OIDC_*` variables are optional alternatives to the Settings form. No change to the op-log format. Note on the "no third-party network calls" principle: when, and only when, the owner has configured a provider, the server contacts that provider's discovery, token and key endpoints; nothing else is contacted and nothing is sent that the flow does not require.

## Capabilities

### New Capabilities
- `oidc-login`: provider configuration, the sign-in flow, identity linking, just-in-time provisioning under the sign-up policy, SSO-only mode, logout behaviour and the client surfaces.

### Modified Capabilities
- none. "Sign-in and sessions" and "Sign-up policy" in `account-access` are unchanged: an SSO sign-in produces the same session and provisioning is only allowed where the existing policy already allows registration (plus an owner toggle that is itself a configuration choice). The authentication status response gains an additive `oidc` field.

## Impact

- Server: `settings` and `identities` tables (additive migrations), a `internal/oidc` package (discovery, PKCE, token exchange, identity-token verification with standard-library crypto), an outbound HTTP client with timeouts limited to the configured issuer, seven handler registrations, and a `sso_required` check in password and passkey sign-in.
- Web app: a provider button on the sign-in screen, a "Single sign-on" panel in Settings for the owner, and a "Linked accounts" panel for every user.
- Docs: `docs/api.md`, `docs/self-hosting/sso.md` (new, with provider walk-throughs), `SECURITY.md`, `.env.example`.
- Dependencies: none added. Binary grows by roughly 60 KB; memory impact is the cached discovery document and key set (a few KB).
