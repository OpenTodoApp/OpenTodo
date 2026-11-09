# Spec Delta

## MODIFIED Requirements

### Requirement: Connecting Google
With a Google client configured, a user SHALL connect Google Calendar through `POST /api/v1/calendar-sync/google/start`, which needs a recently confirmed session and returns Google's authorization address with a single-use state bound to the user and a PKCE challenge, valid for 10 minutes. Google SHALL return the browser to `GET /api/v1/calendar-sync/google/callback`, which SHALL accept only the signed-in session the state belongs to, exchange the code, store the refresh token as the connection's secret, discover the calendars and redirect to the Calendar sync panel. The same flow with a connection id SHALL reconnect that connection.

When the request to start carries an `Origin` that is not the origin of the redirect address (scheme, host and port), the start SHALL be refused with 409 `base_url_mismatch` and no state SHALL be stored. A failed sign-in SHALL name its cause in the address it returns to: `denied` for Google's `access_denied`, `redirect_uri_mismatch` for Google's refusal of the redirect address, `authorization_failed` for any other error from Google or a missing code (Google's own text SHALL never be copied into the address), `google_client_refused` when Google refuses the owner's client id or secret, `scope_not_granted` when the granted scopes leave out the calendar scope, and `caldav_api_disabled` when Google's CalDAV answers 403 to the fresh grant. The panel SHALL show each as a translated message with a link that opens the calendar sync guide at the section that fixes it. No message, address or log line SHALL carry the client secret, a code or a token.

#### Scenario: Connect
- **WHEN** a user starts the flow, consents at Google and Google redirects back with a code and the state
- **THEN** a Google connection exists in the state `choose_calendar`, the refresh token is only in the secrets file, and the browser lands on Settings → Integrations → Calendar sync

#### Scenario: Wrong state
- **WHEN** the callback arrives with an unknown, expired, used or another user's state
- **THEN** no connection is created and the browser lands on the panel with an error

#### Scenario: No client
- **WHEN** a user calls the start route while no Google client is configured
- **THEN** the response is a 409 `google_not_configured` error

#### Scenario: Redirect address is not the page's
- **WHEN** the server runs behind a proxy without `OPENTODO_BASE_URL`, so the redirect address starts with `http://`, and a user on the `https://` page chooses Connect Google
- **THEN** the start answers 409 `base_url_mismatch`, Google is not opened, and the panel says to set `OPENTODO_BASE_URL` with a link to "Wrong address behind a proxy" in the guide

#### Scenario: CalDAV API not enabled
- **WHEN** Google grants the sign-in but its CalDAV answers 403 to discovery
- **THEN** no connection is created, the browser lands on the panel with `calendar-sync=caldav_api_disabled`, and the panel says the CalDAV API is not enabled with a link to "The CalDAV API is not enabled"

#### Scenario: Calendar permission unticked
- **WHEN** the token Google returns lists scopes without `https://www.googleapis.com/auth/calendar`
- **THEN** no connection is created and the panel says the calendar permission was not allowed

#### Scenario: Google's error is not copied
- **WHEN** the callback arrives with a valid state and `error=<script>`
- **THEN** the browser lands on the panel with `calendar-sync=authorization_failed`
