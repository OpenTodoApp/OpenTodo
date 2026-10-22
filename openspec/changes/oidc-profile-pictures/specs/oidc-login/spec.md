## ADDED Requirements

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

## MODIFIED Requirements

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
