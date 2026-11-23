# Proposal

## Why

`ot login` stops with "server did not start a session" for an account with two-factor authentication. For such an account `POST /api/v1/auth/login` answers `{mfaRequired, challenge, expiresAt}` and starts no session until `POST /api/v1/auth/mfa` completes the challenge with a code or a recovery code (`two-factor` spec). The CLI never asked for the second factor, so these accounts could only use a token minted in the web app.

## What Changes

- **`ot login` completes the second factor.** When the password step answers with a challenge, it asks "Two-factor code (or a recovery code):" and sends six digits as `code`, anything else as `recoveryCode`, to `POST /api/v1/auth/mfa`. It then mints the token and signs out as before.
- A wrong code exits as the server's error (code 3) and stores nothing.

Out of scope: remembering the device (`remember`), which applies to browsers only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-client`: sign-in with two-factor authentication.

## Impact

- `internal/cli/cmd_auth.go` (the second step), `internal/cli/client.go` (the session cookie of `/auth/mfa`), a test with a fake server, `docs/cli.md`.
- No server change, no new route, no dependency.
