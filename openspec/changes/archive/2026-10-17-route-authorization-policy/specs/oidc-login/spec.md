## MODIFIED Requirements

### Requirement: Identity to account mapping
An identity token SHALL be matched to an account by issuer and subject first. When no link exists and the token carries an email marked as verified that matches an existing account case-insensitively, the identity SHALL be linked to that account, unless that account is the owner or an admin or has a confirmed second factor or a passkey: then the sign-in SHALL be refused with an `oidc_link_required` indication and nothing written, and the account links only from Settings while signed in. An identity linked by email during a sign-in SHALL never count as passing the account's own second factor. An email that is absent or not verified SHALL never link to an existing account. Links are server-side account data and are not synced.

#### Scenario: Returning identity
- **WHEN** the same issuer and subject sign in a second time, even after the email changed at the provider
- **THEN** the same account is signed in

#### Scenario: Verified email matches an existing account
- **WHEN** a first-time identity presents a verified email that belongs to an existing member password account without a second factor or passkey
- **THEN** the identity is linked to that account and the user is signed in

#### Scenario: Unverified email
- **WHEN** a first-time identity presents an email without a verified marker and no link exists
- **THEN** sign-in is refused with an `oidc_email_unverified` indication and no link or account is created

#### Scenario: Guarded account by email
- **WHEN** a first-time identity presents the verified email of the owner, an admin, or an account with a confirmed second factor or a passkey
- **THEN** the browser is returned to the sign-in screen with `oidc_link_required`, no identity is linked, no session starts and `login.failed` is recorded with that reason

#### Scenario: Guarded account links from Settings
- **WHEN** that account signs in locally, links the provider from Settings and later signs in through the provider
- **THEN** the linked identity signs in to the account
