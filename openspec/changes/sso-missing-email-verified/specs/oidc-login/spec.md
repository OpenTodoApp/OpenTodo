# Spec Delta

## MODIFIED Requirements

### Requirement: Provider configuration
The owner SHALL configure at most one provider through `GET`/`PUT /api/v1/settings/oidc` (issuer, client id, client secret, display name, and the provisioning, SSO-only, provider-logout, profile-picture (`syncPictures`) and missing-email-confirmation (`trustMissingEmailVerified`, off by default) switches) and check it with `POST /api/v1/settings/oidc/test`. The secret SHALL never be returned. Optional `OPENTODO_OIDC_ISSUER`, `OPENTODO_OIDC_CLIENT_ID` and `OPENTODO_OIDC_CLIENT_SECRET` pre-fill and lock those fields. Configuration is server state, not synced, unavailable offline.

#### Scenario: Owner configures and tests
- **WHEN** the owner saves an issuer whose discovery document is reachable and runs the test
- **THEN** the save returns 200 with the secret masked and the test returns 200 with the provider's authorization and token endpoint hosts

#### Scenario: Member or anonymous access
- **WHEN** a member or an anonymous request reads or writes the provider settings
- **THEN** the response is a 403 `forbidden` error for the member and a 401 `unauthorized` error for the anonymous request

#### Scenario: Invalid issuer
- **WHEN** the issuer is not an https URL, or discovery fails or returns an issuer that differs from the configured one
- **THEN** the save or test returns a 400 `invalid_input` error naming the problem and the previous configuration stays in force

#### Scenario: Environment variables lock the form
- **WHEN** `OPENTODO_OIDC_ISSUER` is set and the owner reads the settings
- **THEN** the response marks the issuer as managed by the environment and a `PUT` changing it is refused with `invalid_input`

#### Scenario: Profile picture switch
- **WHEN** the owner saves `syncPictures: true`
- **THEN** the response carries `syncPictures: true`, the change is recorded as `settings.changed` (`oidc.sync_pictures`), and the next provider sign-in syncs the picture

#### Scenario: Missing email confirmation switch
- **WHEN** the owner saves `trustMissingEmailVerified: true`
- **THEN** the response carries it, the change is recorded as `settings.changed` (`oidc.trust_missing_email_verified`), the panel shows a warning while it is on, and the server logs a warning at every start while it stays on

### Requirement: Identity to account mapping
An identity token SHALL be matched to an account by issuer and subject first. When no link exists and the token carries an email marked as verified that matches an existing account case-insensitively, the identity SHALL be linked to that account, unless that account is the owner or an admin, has a confirmed second factor or a passkey, or its address was never confirmed: then the sign-in SHALL be refused with an `oidc_link_required` indication and nothing written, and the account links only from Settings while signed in. An account's address SHALL count as confirmed after a sign-up completed through an emailed link, an email change confirmed through an emailed link, or a link to a provider identity whose verified email equals the account's; an email change applied without confirmation SHALL clear it. When this rule is introduced, accounts that already have a provider identity with the same address SHALL count as confirmed. An identity linked by email during a sign-in SHALL never count as passing the account's own second factor. An email that is absent or not verified SHALL never link to an existing account. When the owner switched on `trustMissingEmailVerified` and a token carries an email but no `email_verified` claim at all, that email SHALL count as verified only for creating a new account under the provisioning rules: it SHALL never link to an existing account (a matching account is refused with `oidc_link_required` and links only from Settings), and it SHALL never confirm the new account's address. Until that address is confirmed through an emailed link, adding it to a project or workspace SHALL treat it as an unknown address: a placeholder invitation that the account never sees, and no notification to it. Accounts created any other way SHALL be found by email as before. An explicit `email_verified: false` SHALL be refused whatever the switch says. Links and the confirmation are server-side account data and are not synced.

#### Scenario: Returning identity
- **WHEN** the same issuer and subject sign in a second time, even after the email changed at the provider
- **THEN** the same account is signed in

#### Scenario: Verified email matches an existing account
- **WHEN** a first-time identity presents a verified email that belongs to an existing member password account without a second factor or passkey, whose address was confirmed through an emailed link
- **THEN** the identity is linked to that account and the user is signed in

#### Scenario: Address typed by someone else
- **WHEN** a member changes their address, without confirmation, to the address of a person who has no account yet, and that person later signs in through the provider for the first time
- **THEN** the sign-in is refused with `oidc_link_required`, no identity is linked to the member's account and no session starts

#### Scenario: Unverified email
- **WHEN** a first-time identity presents an email without a verified marker and no link exists
- **THEN** sign-in is refused with an `oidc_email_unverified` indication and no link or account is created

#### Scenario: Guarded account by email
- **WHEN** a first-time identity presents the verified email of the owner, an admin, or an account with a confirmed second factor or a passkey
- **THEN** the browser is returned to the sign-in screen with `oidc_link_required`, no identity is linked, no session starts and `login.failed` is recorded with that reason

#### Scenario: Guarded account links from Settings
- **WHEN** that account signs in locally, links the provider from Settings and later signs in through the provider
- **THEN** the linked identity signs in to the account

#### Scenario: Provider without email_verified, switch on
- **WHEN** the switch and "allow new accounts via SSO" are on, and a first-time identity presents an email with no `email_verified` claim that belongs to no account
- **THEN** a `member` account linked to that issuer and subject is created and signed in, and its address does not count as confirmed

#### Scenario: Adding an unconfirmed SSO address to a project
- **WHEN** an account was created through the switch and someone adds its address to a project
- **THEN** the answer is the same as for an unknown address, the account sees no invitation and gets no notification, and once its address is confirmed a new addition reaches it as usual

#### Scenario: Provider without email_verified, address taken
- **WHEN** the switch is on and a first-time identity with no `email_verified` claim presents the email of an existing member account
- **THEN** the sign-in is refused with `oidc_link_required`, no identity is linked and no session starts

#### Scenario: Explicitly unverified email, switch on
- **WHEN** the switch is on and a first-time identity presents an email with `email_verified: false`
- **THEN** sign-in is refused with `oidc_email_unverified` and nothing is created

#### Scenario: Switch off
- **WHEN** the switch is off and a first-time identity presents an email with no `email_verified` claim
- **THEN** sign-in is refused with `oidc_email_unverified`, as before
