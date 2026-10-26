# Proposal

## Why

An internal security audit (finding M1) found that a browser session that has not signed in recently could add a new way to sign in: a passkey, an authenticator app, or a linked single sign-on identity. Sessions last up to 90 days, so a session left open on a shared computer, or a stolen session cookie, could plant a credential that survives a password change and "sign out everywhere".

Two of these flows also made the session count as freshly signed in: confirming an authenticator app set the session's re-authentication time, and finishing a provider link did the same. After that, the session could reach every step-up route (create admin API tokens, turn off two-factor, change the email).

## What Changes

- Starting and finishing passkey registration (`POST /api/v1/passkeys/register/options`, `POST /api/v1/passkeys/register`) and starting and confirming authenticator-app enrolment (`POST /api/v1/mfa/totp/enroll`, `POST /api/v1/mfa/totp/confirm`) need a sign-in or re-authentication within the last ten minutes, like creating API tokens and app passwords already does. API tokens keep needing the `admin` scope.
- Confirming an authenticator app marks the session's second factor as satisfied, but no longer counts as re-authentication.
- Linking a new provider identity from Settings needs a recent sign-in; an older session is sent back to Settings with `?error=reauth_required` and nothing is linked. Completing the provider flow with an identity the account already has still re-authenticates the session (accounts that sign in only through the provider rely on it). Linking a new identity no longer re-authenticates.
- The web app asks for the password or a code when one of these steps answers `reauth_required` and then repeats the step (the existing re-authentication dialog); a refused provider link opens the same dialog and starts the link again. When single sign-on is on, the dialog also offers "Confirm with {provider} instead".
- A fresh sign-in counts as recent, so first-run setup and the enrolment the owner's two-factor policy requires right after sign-in work as before.

No op schema, data model or environment variable change. Not **BREAKING**; scripts that enrol with an `admin` token are unaffected.

**Out of scope**: emailing the user when a credential is added (the audit suggests it; a separate change, since mail is optional); removing passkeys or linked identities (they are already `admin`-token routes and do not add a way in). ROADMAP.md item advanced: none; this is a security fix for 0.14.1.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mfa`: adding a way to sign in requires a recent sign-in and never counts as one.
