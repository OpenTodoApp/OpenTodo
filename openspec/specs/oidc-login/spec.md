# oidc-login Specification

## Purpose
Lets the owner connect one OpenID Connect provider so members sign in with an identity they already have, defines how provider identities map to accounts and when new accounts may be created, and offers an SSO-only posture without locking the owner out.

## Requirements

### Requirement: Provider configuration
The owner SHALL configure at most one provider through `GET`/`PUT /api/v1/settings/oidc` (issuer, client id, client secret, display name, and the provisioning, SSO-only, provider-logout and profile-picture (`syncPictures`) switches) and check it with `POST /api/v1/settings/oidc/test`. The secret SHALL never be returned. Optional `OPENTODO_OIDC_ISSUER`, `OPENTODO_OIDC_CLIENT_ID` and `OPENTODO_OIDC_CLIENT_SECRET` pre-fill and lock those fields. Configuration is server state, not synced, unavailable offline.

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

### Requirement: Sign-in through the provider
When a provider is configured, `GET /api/v1/auth/oidc/start` SHALL redirect to the provider using the authorization-code flow with PKCE, a single-use `state` and a `nonce`, and `GET /api/v1/auth/oidc/callback` SHALL exchange the code, verify the identity token (signature, issuer, audience, expiry, nonce) and start a session under the same cookie rules as password sign-in. Both routes SHALL be rate limited per client address.

#### Scenario: Successful sign-in
- **WHEN** a user completes the provider's login and returns to the callback with a valid code and matching state
- **THEN** the session cookie is set and the browser is redirected to the app

#### Scenario: State mismatch or replay
- **WHEN** the callback carries a `state` that was not issued, has expired after ten minutes, or was already used
- **THEN** the response is a 400 `oidc_state_invalid` error (a browser navigation is instead returned to the sign-in screen with that indication) and no session is created

#### Scenario: Provider refuses or token invalid
- **WHEN** the provider returns an error, or the identity token fails any verification step
- **THEN** the browser is redirected to the sign-in screen with an `oidc_failed` indication, no session is created and nothing about the failure reason leaks beyond a generic message

#### Scenario: Provider not configured
- **WHEN** a client calls either route while no provider is configured
- **THEN** the response is a 404 `oidc_disabled` error

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

### Requirement: Just-in-time provisioning under the sign-up policy
When no account matches, the server SHALL create a `member` account from the token's verified email and name only if open sign-up is enabled or the owner switched on "allow new accounts via SSO". Otherwise the sign-in SHALL be refused exactly as a closed registration is.

#### Scenario: Provisioning allowed
- **WHEN** "allow new accounts via SSO" is on and an unknown identity with a verified email signs in
- **THEN** a `member` account linked to that identity is created and signed in

#### Scenario: Provisioning closed
- **WHEN** both open sign-up and the SSO toggle are off and an unknown identity signs in
- **THEN** the browser is returned to the sign-in screen with a `signup_closed` indication and no account is created

### Requirement: Linking and unlinking from Settings
A signed-in user SHALL be able to list linked identities through `GET /api/v1/me/identities`, start a link from Settings (the start route with a session present links instead of signing in), and unlink through `DELETE /api/v1/me/identities/{id}`. Unlinking SHALL be refused when it would leave the account unable to sign in under the current mode. Identities are server state; the Settings panel is read-only offline.

#### Scenario: Link an existing account
- **WHEN** a signed-in password user starts the flow from Settings and completes it
- **THEN** the identity appears in their linked accounts and the session stays the same

#### Scenario: Identity already linked elsewhere
- **WHEN** the identity returned by the provider is already linked to a different account
- **THEN** the link is refused with a 409 `identity_taken` error (a browser navigation is instead returned to Settings with that indication)

#### Scenario: Unlink the last way in
- **WHEN** SSO-only mode is on and a member tries to unlink their only identity, or an anonymous request calls the route
- **THEN** the response is a 409 `last_credential` error for the member and a 401 `unauthorized` error for the anonymous request

### Requirement: SSO-only mode
When the owner enables SSO-only mode, password and passkey sign-in SHALL be refused for every account except the owner, and the sign-in screen SHALL show only the provider action for non-owners. API tokens SHALL continue to authenticate regardless of the mode. The owner's local credentials remain usable as break-glass access.

#### Scenario: Member password refused
- **WHEN** SSO-only mode is on and a member submits a correct email and password
- **THEN** the response is a 403 `sso_required` error and no session is created

#### Scenario: Owner break-glass
- **WHEN** SSO-only mode is on and the owner signs in with a password
- **THEN** the sign-in succeeds

#### Scenario: Scripts keep working
- **WHEN** SSO-only mode is on and a script presents a valid bearer token
- **THEN** the request is authenticated as before

### Requirement: Logout behaviour
Signing out SHALL always delete the local session. When the owner has enabled "sign out of provider" and the provider publishes an end-session endpoint, the client SHALL additionally be redirected there after local sign-out; otherwise no provider request is made.

#### Scenario: Local sign-out by default
- **WHEN** a user who signed in through the provider signs out with the switch off
- **THEN** the local session is deleted and no request goes to the provider

#### Scenario: Provider sign-out enabled
- **WHEN** the switch is on and the user signs out
- **THEN** the local session is deleted first and the browser is then redirected to the provider's end-session endpoint with a return to the sign-in screen

### Requirement: Sign-in screen integration
The authentication status response SHALL expose whether a provider is configured, its display name and whether SSO-only mode is on, so the sign-in screen can show a "Sign in with <name>" action, hide the password form for non-owners in SSO-only mode, and surface callback failures. Offline behaviour is unchanged: a device that signed in earlier opens from its cached account without contacting the provider.

#### Scenario: Provider button
- **WHEN** a provider named "Home SSO" is configured and the sign-in screen loads
- **THEN** a "Sign in with Home SSO" action is shown next to the password form

#### Scenario: Offline app start after SSO sign-in
- **WHEN** an installed app whose last sign-in was through the provider is opened offline
- **THEN** it opens to the user's tasks without any provider round-trip

### Requirement: Profile picture from the provider
When the owner's switch `syncPictures` is on and a provider sign-in or link carries a `picture` claim, the server SHALL fetch that address through the outbound policy (http(s) only, no private network target unless the owner allows them, at most 5 seconds and 2 MB, a PNG, JPEG or GIF of at most 4096 pixels a side), crop it to its centre square, scale it to 256×256, re-encode it as JPEG and store it as the account's profile picture, recording that it came from the provider and from which address. The server SHALL NOT replace a picture the person uploaded, SHALL NOT fetch an address it already synced for the account, and SHALL NOT fetch again an address whose picture the person removed. A fetch that fails SHALL leave the picture and the sign-in as they are. With the switch off the claim SHALL be ignored. The switch is off by default.

#### Scenario: Picture synced at sign-in
- **WHEN** the switch is on and an identity whose token names `https://pictures.example.com/me.png` (a 400×300 PNG) signs in
- **THEN** the account's picture is a 256×256 JPEG of the centre square, its `avatarVersion` is bumped, and the picture appears to project co-members after their next sync

#### Scenario: Same address not fetched twice
- **WHEN** the same identity signs in again with the same `picture` address
- **THEN** the server makes no request and the picture is unchanged

#### Scenario: Uploaded picture kept
- **WHEN** the person uploaded a picture in Settings and later signs in through the provider with any `picture` address
- **THEN** the uploaded picture stays and no request is made

#### Scenario: Removed picture not fetched again
- **WHEN** the person removed the provider's picture in Settings and signs in again with the same `picture` address
- **THEN** the account stays without a picture; a different address is fetched

#### Scenario: Fetch fails
- **WHEN** the address answers 500, is not an image, exceeds 2 MB or names a private network host the owner has not allowed
- **THEN** the sign-in completes, the picture is unchanged and the server logs a warning without the account's name

#### Scenario: Switch off
- **WHEN** the switch is off and an identity with a `picture` claim signs in
- **THEN** no request is made and the account's picture is unchanged
