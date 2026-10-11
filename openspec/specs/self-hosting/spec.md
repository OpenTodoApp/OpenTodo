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
The server and client SHALL make no network requests to third parties and SHALL collect no usage data. The only outbound requests the server makes SHALL be to destinations the owner or a user explicitly configured (such as a backup destination or a webhook endpoint), and none of them SHALL carry usage data beyond the configured payload.

#### Scenario: Network audit
- **WHEN** the app is used for a session with the network inspected and no integration is configured
- **THEN** every request goes to the server's own origin

#### Scenario: Only configured destinations
- **WHEN** the owner has configured a backup destination and the server's outbound traffic is inspected
- **THEN** every outbound request goes to that destination and to nothing else

### Requirement: Optional demo mode
The server SHALL accept an optional `OPENTODO_DEMO` variable, off when unset. `true` SHALL turn the instance into a public demo (OpenSpec `demo-mode`); an invalid value SHALL stop startup with a message naming the variable. Demo mode SHALL need no other variable and SHALL be meant for a dedicated data directory.

#### Scenario: Unset
- **WHEN** the server starts without `OPENTODO_DEMO`
- **THEN** it behaves exactly as before and the owner setup screen appears on an empty data directory

#### Scenario: Invalid value
- **WHEN** `OPENTODO_DEMO=sometimes` is set
- **THEN** the process exits non-zero with a message naming `OPENTODO_DEMO`

### Requirement: Rolling updates
A new server process SHALL start and serve on a data directory that an older process still serves, so orchestrators can replace a container without downtime. Background jobs (reminder push, webhook deliveries, backups, email polling, Trash retention, audit pruning, demo reset) SHALL run in only one process at a time and SHALL move to the new process when the old one stops. Maintenance commands SHALL still refuse while any server runs.

#### Scenario: Coolify rolling update
- **WHEN** a new container starts on the volume while the old one still runs
- **THEN** the new one passes its health check and serves requests, the old one keeps running the background jobs until it stops, and the new one then takes them over

#### Scenario: Restore while serving
- **WHEN** `opentodo restore` runs while any server process uses the data directory
- **THEN** it refuses and asks to stop the server first

#### Scenario: Leader crashes
- **WHEN** the process running the background jobs is killed
- **THEN** another running process starts them within a few seconds
