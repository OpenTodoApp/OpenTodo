# self-hosting Specification

## Purpose
Defines the deployment contract: one small container, one data directory, configuration through optional environment variables, health reporting, security headers and compatibility with Coolify and plain Docker Compose.

## Requirements

### Requirement: Single container, single binary
The server SHALL ship as one container image containing one statically linked binary that serves both the API and the web app. The image SHALL run as a non-root user, SHALL contain no shell or package manager, and the compressed image SHALL stay under 50 MB.

#### Scenario: Run with no arguments
- **WHEN** the container starts with no configuration
- **THEN** it listens on port 8080 and serves the app and API on the same origin

### Requirement: One data directory
All persistent state SHALL live under the configured data directory (`/data` in the image). Backing up that directory SHALL be sufficient to restore everything.

#### Scenario: Restore from a copy
- **WHEN** the data directory is copied to a new host and the container is started there
- **THEN** all accounts, projects, tasks and tokens are available

### Requirement: Schema migrations
The server SHALL apply embedded database migrations automatically at startup and SHALL refuse to start if a migration fails.

#### Scenario: Upgrade
- **WHEN** a newer image starts against a data directory from an older version
- **THEN** pending migrations run before the server accepts requests

### Requirement: Optional configuration only
Every setting SHALL be an `OPENTODO_*` environment variable with a working default: `ADDR`, `DATA_DIR`, `BASE_URL`, `ALLOW_SIGNUP`, `SESSION_DAYS`, `LOG_LEVEL`. Invalid values SHALL stop startup with a clear message.

#### Scenario: Invalid value
- **WHEN** `OPENTODO_SESSION_DAYS=abc` is set
- **THEN** the process exits non-zero with a message naming the variable

### Requirement: Health check
The binary SHALL offer a `healthcheck` subcommand that exits 0 only when the local server answers `/healthz` with 200, so container platforms without curl can probe it.

#### Scenario: Container health
- **WHEN** the orchestrator runs the configured health check
- **THEN** it succeeds while the server is up and fails when the database is unavailable

### Requirement: Coolify-compatible compose file
The repository SHALL include a `docker-compose.yml` that Coolify can deploy from the repository URL with no manual variables: it SHALL declare the magic domain variable for the service port, pass the generated public URL as `OPENTODO_BASE_URL`, mount a named volume on `/data`, and define a health check. The same file SHALL work with plain `docker compose up`.

#### Scenario: Deploy on Coolify
- **WHEN** the repository is added as a Docker Compose resource in Coolify and deployed
- **THEN** the app is reachable on the assigned HTTPS domain and the owner setup screen appears

### Requirement: Security headers
Responses SHALL carry a Content-Security-Policy restricting scripts, connections and frames to the app's own origin, plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and a same-origin referrer policy.

#### Scenario: Headers present
- **WHEN** the app shell is requested
- **THEN** the response includes the Content-Security-Policy with `script-src 'self'` and `frame-ancestors 'none'`

### Requirement: No telemetry
The server and client SHALL make no network requests to third parties and SHALL collect no usage data.

#### Scenario: Network audit
- **WHEN** the app is used for a session with the network inspected
- **THEN** every request goes to the server's own origin
