## MODIFIED Requirements

### Requirement: Health endpoint
`GET /healthz` SHALL require no authentication and SHALL return 200 with the version when the database is reachable, otherwise 503. `GET /api/v1/health` SHALL give the same answer, for clients behind reverse proxies and platforms that answer `/healthz` themselves; both SHALL reveal nothing but the status and the version, whoever asks.

#### Scenario: Healthy server
- **WHEN** a monitor requests `/healthz`
- **THEN** the response is 200 with `{"status":"ok","version":"<version>"}`

#### Scenario: Behind a proxy that reserves /healthz
- **WHEN** a client behind Pomerium or Google Cloud Run requests `/api/v1/health` without credentials
- **THEN** the request reaches the server and the response is 200 with `{"status":"ok","version":"<version>"}`, the same as `/healthz` answers

#### Scenario: Signed in or with a token
- **WHEN** a signed-in browser or a `read` API token requests `/api/v1/health`
- **THEN** the response is the same 200 answer, with no account data

#### Scenario: Database unreachable
- **WHEN** the database cannot be read and a monitor requests `/healthz` or `/api/v1/health`
- **THEN** both answer 503 with the error code `unhealthy`
