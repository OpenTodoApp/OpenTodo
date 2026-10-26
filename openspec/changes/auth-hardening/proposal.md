# Sign-in hardening: confirmed addresses, first-run setup, reset timing

## Why

An internal security audit found three low-severity weaknesses around accounts:

- **Single sign-on trusted unconfirmed addresses (L5).** A first sign-on with a verified provider email linked to an existing account with that address. But an account's address may never have been confirmed: sign-up without outgoing email and email changes applied at once take any address. A member could set their address to a newcomer's and capture that person's first sign-on into an account the member controls.
- **Forwarded addresses and the setup code (L7).** The first account needed no setup code from a private address. Behind a NAT, a port forwarder or a rootless container every client, also one from the internet, arrives from a private address, so a freshly exposed server could be claimed. When every forwarded hop was trusted, the client address came from the leftmost entry, which the client writes.
- **Password reset timing (L8).** The answer to "Forgot password?" waited for the mail to be sent for an existing account, which usually takes longer than the 200 ms padding, revealing which addresses have accounts.

## What Changes

- Accounts record when their address was confirmed (`users.email_verified_at`): a sign-up or email change confirmed through an emailed link, or a provider identity whose verified email matches. An unconfirmed email change clears it. Single sign-on links to an existing account by email only when it is set; otherwise the person links from Settings while signed in (the existing `oidc_link_required` flow). On upgrade, accounts with a matching provider identity count as confirmed.
- The first account needs no setup code only from this machine: a loopback connection with no forwarding header. Every other first registration needs the code from the log (or the configured setup token).
- When every forwarded hop is trusted, the client is the last `X-Forwarded-For` entry. One warning per process is logged when a trusted, non-loopback peer sends no `X-Forwarded-For`.
- The self-service reset request answers after the fixed padding and looks up and mails in the background.

**Behaviour change for new installs:** the first visit from another machine on the local network (for example a NAS running Docker) now asks for the setup code printed in the log. Not **BREAKING** for the op log; no new route or environment variable. One added column, created by a Go migration step.

Out of scope: a way to confirm the current address without changing it, emailing the user when a credential is added, and changing how invitations treat addresses.

ROADMAP: hardening of shipped features (`oidc-login`, `account-access`, `self-hosting`); no new item.

## Capabilities

### Modified Capabilities

- `oidc-login`: "Identity to account mapping" requires a confirmed address.
- `account-access`: "First-run owner setup" exempts only this machine; "Self-service password reset request" answers before the lookup and delivery.
- `self-hosting`: "Client address from trusted proxies only" falls back to the nearest proxy's entry and warns about an unforwarded trusted peer.

## Impact

- `internal/store` (`migrateEmailVerified`), `internal/auth/oidc.go`, `profile.go`, `signup.go`; `internal/httpapi/clientip.go`, `auth_handlers.go`, `middleware.go`, `users.go`, `server.go`.
- Tests: `internal/auth/oidc_test.go`, `signup_test.go`, `internal/store/email_verified_migration_test.go`, `internal/httpapi/client_identity_test.go`, `clientip_test.go`, `mail_test.go`; the test env waits for background work.
- Docs: `docs/sso.md`/`docs/self-hosting/sso.md`, `docs/self-hosting/docker.md`, `docs/getting-started.md`, `docs/self-hosting/home-assistant-addon.md`; CHANGELOG `### Security`.
