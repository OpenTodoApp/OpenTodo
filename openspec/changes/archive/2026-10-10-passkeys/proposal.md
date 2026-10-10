# Proposal

## Why

Password sign-in is the only credential today. It is phishable, it depends on users choosing a 10+ character secret, and it is tedious on a phone where the app is installed as a PWA. Passkeys give every device a phishing-resistant, origin-bound credential unlocked by the device's own biometrics or PIN, with no secrets to type and nothing for the server to leak but public keys. For a self-hosted service exposed on the internet this is the biggest single security upgrade available, and it needs no third party.

## What Changes

- A new `passkey-auth` capability: a signed-in user registers one or more passkeys, each with a device name; signs in without a password using a passkey (including browser autofill of discoverable credentials); and renames or revokes passkeys from Settings.
- The password stays as a fallback credential in this change; a passkey is an additional way to prove identity, never a replacement that could lock someone out.
- Passkey availability is derived from `OPENTODO_BASE_URL`: the relying-party identifier is its host and ceremonies are only offered when that URL is https (or a localhost development origin). The authentication status response tells the client whether passkeys are available so the sign-in screen can adapt.
- New authenticated routes under `/api/v1/passkeys` (begin and finish registration, list, rename, delete) and two unauthenticated, rate-limited routes under `/api/v1/auth/passkey` (begin and finish sign-in). Challenges are single use and short-lived.
- Settings gains a Security section listing passkeys with their creation and last-use times.

Out of scope: removing the password entirely or "passkey-only" accounts (needs account recovery design; revisit with `mfa-totp` and `audit-log`), using a passkey as a second factor on top of a password (that is `mfa-totp`'s job; this change may be extended later to count a passkey as a factor), attestation verification and authenticator allow-lists, cross-device sign-in via the CLI, and OIDC.

This change advances ROADMAP.md section 7, "Passkeys (WebAuthn)".

No new mandatory environment variable: servers without an https base URL keep working with passwords and simply do not offer passkeys. No change to the op-log format; credentials are account data on the server only.

## Capabilities

### New Capabilities
- `passkey-auth`: availability rules, registration of multiple passkeys per account, passwordless sign-in, password fallback, naming and revocation, and the client flows in the sign-in screen and Settings.

### Modified Capabilities
- none. "Sign-in and sessions" in `account-access` is unchanged: a passkey sign-in produces the same session cookie under the same rules. The authentication status response gains an additive field.

## Impact

- Server: a small WebAuthn verification package (CBOR parsing of the attestation object, COSE public keys, ES256/RS256/EdDSA signature checks), new `passkeys` table (additive migration), an in-memory challenge store, seven handler registrations, and an extra field in `auth/status`.
- Web app: a passkey client wrapper around the browser credential API, a "Sign in with a passkey" path on the sign-in screen with conditional autofill, and a Security panel in Settings.
- Docs: `docs/api.md` (routes), `SECURITY.md` (credential model), `docs/self-hosting/*.md` (why `OPENTODO_BASE_URL` must be https for passkeys).
- Dependencies: one pure-Go CBOR decoder module (see design.md); roughly +0.4 MB on the ~12 MB binary, no measurable memory change. No new npm dependency; the browser API is built in.
