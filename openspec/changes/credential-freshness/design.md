# Design

## Route policies

The four enrolment routes move from `signedIn.credential()` to `signedIn.sensitive()` (credential plus recent). The policy wrapper already answers `403 reauth_required` for a session whose `reauth_at` is older than `FreshWindow` (ten minutes) and accepts only `admin` tokens on these routes, so no handler changes. `policy_test.go` pins the new flags.

Every route that adds a credential or sign-in method was checked against `policy.go`: API tokens, app passwords, recovery-code regeneration, project and account invitations, calendar and issue connections and the relay device were already `recent()`. Renaming or removing a passkey and unlinking an identity do not add a way in and stay `credential()`.

## No freshness from enrolment

`ConfirmTOTPEnrollment` writes `mfa_at` on `session_auth` and leaves `reauth_at` alone. Because the confirm route itself now needs a recent sign-in, the row always exists with a recent `reauth_at` when it runs.

## Provider link

The start route stays public (it is also the sign-in route). The callback decides: with a session within `FreshWindow` it links as before; with an older session it only accepts an identity already linked to that account (`auth.ConfirmLinkedIdentity`, which records the use and links nothing). An unlinked identity from an older session is refused with `reauth_required` (a redirect to `/settings/account/security?error=reauth_required` for a browser). `MarkReauthenticated` runs only for an already-linked identity, so linking a new one never grants freshness.

## Web

The API client already turns `reauth_required` into the re-authentication dialog and repeats the request once, and every enrolment call goes through it. Changes:

- `promptReauth()` (lib/api) opens the dialog without a refused request. The linked-accounts panel calls it when it is opened with `?error=reauth_required` and starts the link again after a successful confirmation.
- The dialog offers "Confirm with {provider} instead" when single sign-on is on, a plain link to the start route: it leaves the page, so the user repeats the action after coming back.
- The passkey panel treats a cancelled prompt as "nothing changed", like the two-factor panel.

Interface budget: no new screen chrome; one optional line in an existing dialog. Bundle impact: negligible (a few lines). No new dependency, no data model change.
