# Proposal

## Why

An address counts as verified only when its holder opened a link sent to it (`sso-email-verified`). An owner created with the setup token, or an account whose email changed while the server had no outgoing email, has an unverified address, and nothing let them verify it: Profile → Email offers only **Change email**, and entering the current address is refused as "already the account's email". Features that need a verified address, such as a routine's **Email me** step, then stay hidden (issue #1194).

## What Changes

- **Confirm the current address.** When the server sends email by link and the account's address is not verified, the Profile card says so and offers **Send a confirmation link**. It sends the same 24-hour link as an email change, to the current address; opening it marks the address verified. No notice goes to the "old" address, since it is the same one.
- `POST /api/v1/me/email` accepts the account's own address when it is unverified (still refused as `invalid_input` when it is verified, or without outgoing email).
- `GET /api/v1/me/profile` reports `emailVerified`.

No data change, no new route, no environment variable.

## Capabilities

### Modified Capabilities

- `account-profile`: Changing the email covers confirming the current, unverified address.

## Impact

`internal/auth/profile.go`, `internal/httpapi/profile.go`, `web/src/app/profile/ProfileSection.tsx`, `web/src/lib/settingsCopy.ts`, locales, `docs/` profile page.
