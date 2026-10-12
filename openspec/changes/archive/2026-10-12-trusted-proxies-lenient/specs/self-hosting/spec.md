## MODIFIED Requirements

### Requirement: Optional configuration only
Every setting SHALL be an `OPENTODO_*` environment variable with a working default: `ADDR`, `DATA_DIR`, `BASE_URL`, `ALLOW_SIGNUP`, `SESSION_DAYS`, `LOG_LEVEL`. Invalid values SHALL stop startup with a clear message, except `OPENTODO_TRUSTED_PROXIES`, whose invalid entries are ignored with a warning (requirement "Lenient trusted proxies").

#### Scenario: Invalid value
- **WHEN** `OPENTODO_SESSION_DAYS=abc` is set
- **THEN** the process exits non-zero with a message naming the variable

## ADDED Requirements

### Requirement: Lenient trusted proxies
`OPENTODO_TRUSTED_PROXIES` SHALL accept entries separated by commas or whitespace, each `cloudflare` (any case), an IP or a CIDR. Invalid entries SHALL NOT stop startup or fail the health check: the server SHALL ignore them, apply the valid ones and log one error naming them, what is accepted and what applies, hinting `cloudflare` for a near miss. Ignoring SHALL never widen trust; with no valid entry it SHALL behave as unset.

#### Scenario: Typo in the keyword
- **WHEN** the server starts with `OPENTODO_TRUSTED_PROXIES=cloudflar`
- **THEN** it starts and passes its health check, logs an error naming `cloudflar` with a "did you mean cloudflare?" hint, and attributes requests exactly as with the variable unset

#### Scenario: Mixed valid and invalid entries
- **WHEN** the value is `nope, 192.0.2.0/24`
- **THEN** hops in `192.0.2.0/24` are skipped as trusted proxies and `nope` is ignored and logged

#### Scenario: Separators and case
- **WHEN** the value is `CloudFlare 192.0.2.1` with a space instead of a comma
- **THEN** both entries apply and nothing is logged

### Requirement: Owner sees configuration warnings
`GET /api/v1/me` SHALL carry a `config_warnings` array (variable, message, ignored values) for the owner's session only, empty without warnings. Admins, members and API tokens SHALL never receive it. The app SHALL show each warning to the owner at the top of the Settings overview and Settings → Administration, naming the ignored value and the fix. The data is server configuration, not synced; offline the notice is absent.

#### Scenario: Owner sees the typo
- **WHEN** an entry of `OPENTODO_TRUSTED_PROXIES` was ignored and the owner opens Settings
- **THEN** a notice names `OPENTODO_TRUSTED_PROXIES`, the ignored value and that the value must be corrected and the server restarted

#### Scenario: Others never see it
- **WHEN** an admin or member session, or any API token including the owner's, requests `GET /api/v1/me`
- **THEN** the response has no `config_warnings` and the app shows no notice

#### Scenario: Unauthenticated request
- **WHEN** `GET /api/v1/me` is requested without a session or token
- **THEN** the server answers 401 and reveals no warning
