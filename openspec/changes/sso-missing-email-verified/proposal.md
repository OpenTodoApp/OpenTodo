# Proposal

## Why

Synology SSO Server (DSM 7.4) sends no `email_verified` claim, so every first sign-in through it is refused with `oidc_email_unverified` (discussion #1483, issue #1968). Today the only way in is to create a local account and link the provider by hand from Settings.

## What Changes

- **A switch in Settings → Single sign-on**, off by default: "Accept a missing email confirmation (new accounts only)". When it is on, an identity token **without** an `email_verified` claim may create a new account under the existing provisioning rules (open sign-up or "Allow new accounts via SSO"). An explicit `email_verified: false` is still refused.
- **Never a link by email.** Such an identity never links to an existing account. If one has its address, sign-in is refused with `oidc_link_required`, and that account keeps the manual linking step from Settings. This applies to every account, not only the guarded ones.
- **No confirmation from it.** The new account's address does not count as confirmed, and the account is marked (`users.email_assumed`). Until the address is confirmed, adding it to a project or workspace treats it as unknown (a placeholder invitation the account never sees), an invite link bound to it refuses the account, and no email goes to it except the confirmation itself. The identity is keyed by issuer and `sub` as today.
- **Warnings.** The panel shows a warning while the switch is on, and the server logs one at start. Changing the switch is in the audit log like the other SSO settings.
- **Docs:** `docs/self-hosting/sso.md` gets a Synology SSO Server entry (the switch, or the manual linking path) and a warning to turn the switch on only for a provider the owner controls, where users can't set their own address.

## Capabilities

### Modified Capabilities

- `oidc-login`: "Provider configuration" gains the switch; "Identity to account mapping" says what a token without `email_verified` may do.

## Impact

- `internal/oidc` (the claim's presence, the setting), `internal/auth/oidc.go` (`MatchOrProvision`), `internal/httpapi/oidc.go` (settings JSON, mapping, start-up warning), `web/src/app/SsoPanel.tsx`, `web/src/lib/types.ts`, the message catalogs, `docs/self-hosting/sso.md`.
- One column, `users.email_assumed` (a Go migration step, default 0); the switch is one more stored SSO setting. No new dependency.
