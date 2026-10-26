# Design: auth-hardening

## D1. A confirmed address per account

`users.email_verified_at INTEGER NULL`, added by a Go step in `store.Migrate` (`migrateEmailVerified`) because `ALTER TABLE ADD COLUMN` cannot be repeated and the step must not depend on migration numbering. When the column is added, accounts with an identity whose stored email equals the account's are set to `created_at`; everyone else starts unconfirmed.

Set by:
- `CompleteSignup` (the verification link went to the address);
- `ConfirmEmailChange` (the confirmation link went to the address);
- `insertIdentity` when the provider's email is verified and equals the account's (provisioning, sign-on link, Settings link).

Cleared by `ChangeEmailNow` (no outgoing email: nobody proved the new address).

Not set by invitation registration or password reset: an admin can hand both links to anyone, so they prove nothing about the address.

## D2. Auto-linking needs a confirmed address

`MatchOrProvision` refuses with `ErrLinkRequiresSession` when the matching account is unconfirmed, the same answer as for guarded accounts. The web app already explains `oidc_link_required`: sign in with the password and link from Settings. No new UI or strings.

## D3. First-run exemption only for this machine

`isLocalSetup(r)`: the TCP peer is loopback and the request has none of `X-Forwarded-For`, `Forwarded`, `X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP`. A private peer no longer counts: Docker's port publishing, NAT and rootless port forwarders make internet clients look private. The setup screen already asks for the code when the status says so; docs explain `docker logs`.

## D4. All-trusted forwarding chain

`clientIP` returns `hops[len-2]` (the last `X-Forwarded-For` entry, appended by the nearest proxy) instead of `hops[0]` when every hop is trusted, and the peer when there is no header. `warnUnforwarded` logs once per Server when a trusted, non-loopback peer sends no `X-Forwarded-For`.

## D5. Reset in the background

`handleRequestPasswordReset` validates, rate-limits, then starts `sendPasswordReset` in a goroutine tracked by `Server.background` (a WaitGroup) and answers after `resetMinDuration`. The mail service's own limits and the link revocation on failure are unchanged. Tests wait on the WaitGroup in the env's `do`. A process stopping mid-send loses that message, like a failed send.

## Data model

One nullable column on `users`. No op, no sync change.

## Size and memory

None.
