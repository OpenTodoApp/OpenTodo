---
title: Single sign-on
summary: Connect an OpenID Connect provider, link accounts, SSO-only mode and break-glass access for the owner.
audience: admin
specs: [oidc-login]
screens: []
order: 40
---
# Single sign-on (OpenID Connect)

OpenTodo can let people sign in with an identity provider you already run: Authentik, Keycloak, Authelia, Zitadel, Pocket ID, Kanidm, or a hosted login service. Any provider that supports OpenID Connect discovery and the authorization-code flow with PKCE works. Nothing is needed to run OpenTodo without it: the feature is off until you configure a provider.

What it does:

- Adds **Sign in with &lt;name&gt;** to the sign-in screen, next to the password form.
- Signs in the account linked to that identity. On the first sign-in, an identity whose provider says the email is **verified** is linked to the account with that email (for example your own owner account).
- Optionally creates a `member` account for someone who has no account yet (**Allow new accounts via SSO**), or when open sign-up is on.
- Optionally requires single sign-on for everyone except the owner (**SSO only**).
- Optionally signs people out of the provider when they sign out of OpenTodo.

Network: when, and only when, a provider is configured, the server contacts the issuer's discovery document (`<issuer>/.well-known/openid-configuration`) and the token and key endpoints it lists. Requests time out after 10 seconds and do not follow redirects. Nothing else is contacted.

## 1. Set the public URL

Providers only accept the exact redirect URI you register. Set `OPENTODO_BASE_URL` to the URL people use, with https:

```bash
OPENTODO_BASE_URL=https://todo.example.com
```

The redirect URI is then `https://todo.example.com/api/v1/auth/oidc/callback`. **Settings → People → Single sign-on** always shows the exact value; without `OPENTODO_BASE_URL` it is derived from the address in your browser and the panel warns you.

## 2. Create a client at the provider

Create an OpenID Connect client ("application", "relying party"):

| Setting | Value |
| --- | --- |
| Client type | Confidential (a client secret). Public clients without a secret also work, PKCE is always used |
| Grant type | Authorization code |
| Redirect URI | `https://todo.example.com/api/v1/auth/oidc/callback` |
| Post-logout redirect URI | `https://todo.example.com/` (only for provider sign-out) |
| Scopes | `openid email profile` |
| Signing algorithm | RS256, PS256, ES256 or EdDSA (RS256 is the usual default) |
| Client authentication | `client_secret_basic` or `client_secret_post` |

Make sure the provider sends `email` and `email_verified` in the identity token. Without a verified email an identity cannot be linked to an existing account or create one.

Provider notes:

- **Authentik**: Applications → Providers → OAuth2/OpenID Provider. The issuer is `https://auth.example.com/application/o/<application-slug>/`.
- **Keycloak**: create a client with *Client authentication* on and *Standard flow* on. The issuer is `https://sso.example.com/realms/<realm>`. Users need *Email verified* set for linking.
- **Authelia**: add a client under `identity_providers.oidc.clients` with `redirect_uris`, `scopes: [openid, email, profile]` and `require_pkce: true`. The issuer is your Authelia URL.
- **Zitadel / hosted services**: use a Web application with PKCE and the code flow; the issuer is shown on the application page.

## 3. Configure OpenTodo

Open **Settings → People → Single sign-on** as the owner:

1. Enter the **Issuer URL**, **Client ID**, **Client secret** and a **Button label** (for example "Home SSO").
2. Click **Test connection**. OpenTodo fetches the discovery document and shows the sign-in and token hosts. An issuer that is not https, unreachable, or reports a different issuer is refused and nothing changes.
3. Click **Save**. The sign-in screen now offers **Sign in with Home SSO**.
4. Sign in through the provider once with your own account to check it: the identity is linked to your owner account through its verified email.

Saving needs a recent sign-in, as for other sensitive settings; if your session is older than ten minutes you are asked for your password or a code first.

### Configuration through the environment

Infrastructure-as-code setups can set these optional variables instead. Each one overrides the value from Settings and locks that field in the panel:

| Variable | Purpose |
| --- | --- |
| `OPENTODO_OIDC_ISSUER` | Issuer URL (https) |
| `OPENTODO_OIDC_CLIENT_ID` | Client id |
| `OPENTODO_OIDC_CLIENT_SECRET` | Client secret |
| `OPENTODO_OIDC_DISPLAY_NAME` | Button label |
| `OPENTODO_OIDC_SSO_ONLY` | `true` or `false`; overrides the SSO-only switch (also the emergency switch, see below) |

The other switches (new accounts via SSO, provider sign-out, scopes) are set in the panel.

## Accounts and linking

- An identity is recognised by its issuer and subject (`sub`), never by email once linked. Changing your email at the provider keeps you on the same OpenTodo account, and a changed email cannot take over another account.
- A first-time identity with a verified email that matches an account is linked to it. An unverified or missing email is refused (`oidc_email_unverified`) and nothing is created.
- When nothing matches, a `member` account is created only if **Allow new accounts via SSO** is on or `OPENTODO_ALLOW_SIGNUP=true`. Otherwise the person sees "There is no account for this identity yet" and you can invite them.
- Accounts created this way have no password. They can add a passkey in **Settings → Account**.
- Everyone can link or unlink the provider in **Settings → Account → Linked accounts**. Unlinking is refused when it would leave the account with no way to sign in.
- A provider sign-in counts as two-factor: someone with an authenticator app is not asked for a code, because the provider applies its own policy. If the owner requires two-factor for everyone (**Settings → People → Two-factor authentication**), accounts without an authenticator are still asked to enrol one.

## SSO only

**Require single sign-on** refuses password and passkey sign-in, and password registration, for every account except the owner. Members see only the provider button. API tokens and the `ot` CLI keep working, because a token is already a delegated credential.

SSO-only mode only applies while a provider is configured: clearing the issuer turns it off too, so members are never locked out by removing the provider.

### Break-glass access for the owner

The owner always keeps their password (and passkeys):

- Open `https://todo.example.com/?owner=1` to get the password form while SSO-only is on.
- If the provider is down or misconfigured and you need to turn SSO-only off without signing in, set `OPENTODO_OIDC_SSO_ONLY=false` and restart the server. That environment value wins over the stored setting until you remove it.
- If you also lost your owner password's second factor, see `opentodo mfa-reset` in [SECURITY.md](../../SECURITY.md).

## Signing out

Signing out of OpenTodo always ends the OpenTodo session only. With **Sign out of &lt;name&gt; too** on (and a provider that publishes an `end_session_endpoint`), people who signed in through the provider are then sent to the provider's sign-out page with an `id_token_hint`, and back to OpenTodo's sign-in screen afterwards. Register `https://todo.example.com/` as a post-logout redirect URI at the provider for that.

## Offline

An installed app that signed in through the provider opens offline from its cached account, like any other session; the provider is only contacted when someone signs in.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| The provider says the redirect URI is invalid | `OPENTODO_BASE_URL` is unset or differs from the registered redirect URI; copy the value from the panel |
| "Signing in with … did not work" | The code exchange or token check failed. The server log (`level=WARN msg="oidc sign-in failed"`) names the step: wrong client secret, audience, clock skew over 60 seconds, unsupported signing algorithm |
| "did not confirm a verified email address" | The provider sends no `email_verified: true`; enable email verification or the `email` scope |
| "There is no account for this identity yet" | Provisioning is off: invite the person, or turn on **Allow new accounts via SSO** |
| "That sign-in took too long or was started in another tab" | The 10-minute sign-in window passed, or the server restarted during the sign-in; start again |

## Security notes

- The flow uses PKCE (S256), a single-use `state` and a `nonce`, kept in a signed, `HttpOnly`, `SameSite=Lax`, 10-minute cookie. The signing key is random per process.
- Identity tokens are verified with the provider's published keys (refreshed when an unknown key id appears, at most every 10 seconds). Only RS256, PS256, ES256 and EdDSA are accepted; `none` and HMAC are refused; issuer, audience, expiry, issued-at and nonce are checked with 60 seconds of leeway.
- The client secret is stored in `<data>/secrets/oidc.json` (mode 0600), not in the database, so database backups do not contain it. Backups exclude the secrets directory: after restoring onto a new host, enter the secret again (or set `OPENTODO_OIDC_CLIENT_SECRET`).
