## MODIFIED Requirements

### Requirement: Coolify-compatible compose file
The repository SHALL include a `docker-compose.yml` that Coolify can deploy from the repository URL with no manual variables: it SHALL declare the magic domain variable for the service port, pass the generated public URL as `OPENTODO_BASE_URL`, mount a named volume on `/data`, and define a health check. The same file SHALL work with plain `docker compose up`. It SHALL publish the host port on `127.0.0.1` unless the operator sets `OPENTODO_BIND` to another address, so the server is not reachable around a reverse proxy by default, and its comments SHALL explain how to open it on the local network.

#### Scenario: Deploy on Coolify
- **WHEN** the repository is added as a Docker Compose resource in Coolify and deployed
- **THEN** the app is reachable on the assigned HTTPS domain and the owner setup screen appears

#### Scenario: Plain compose on one machine
- **WHEN** someone runs `docker compose up -d` with no `.env`
- **THEN** `http://localhost:8080` opens the app and port 8080 is not reachable from other machines

#### Scenario: Home server on the LAN
- **WHEN** the operator sets `OPENTODO_BIND=0.0.0.0` in `.env` and starts the stack
- **THEN** other devices on the network reach the app at the host's address and port

## ADDED Requirements

### Requirement: Patched release toolchain
Release binaries and images SHALL be built with the Go toolchain named by the `toolchain` line in `go.mod`, which SHALL be a patch release of the `go` line's version; the Dockerfile's default Go version SHALL be the same patch. CI SHALL fail when the Go in use differs from that toolchain, and SHALL run a pinned `govulncheck` that fails when the code can reach a known vulnerability.

#### Scenario: Runner with another Go
- **WHEN** a CI job that builds or tests the server runs with a Go other than the `go.mod` toolchain
- **THEN** the job fails naming the expected toolchain

#### Scenario: Reachable vulnerability
- **WHEN** a dependency or the standard library has a published vulnerability in a function the server calls
- **THEN** the server job fails until the toolchain or dependency is updated

#### Scenario: Dockerfile drifts from go.mod
- **WHEN** the `toolchain` line is bumped without the Dockerfile's `GO_VERSION`
- **THEN** the repository checks fail

### Requirement: CI path filter covers every input
The CI path filter SHALL classify every file that is compiled into the binary or checks the deploy templates (including `skills/`, `deploy/`, `scripts/deploy*` and the root `docker-compose.yml`) as code, so changes to them run the server jobs, and its classification SHALL be covered by a table of paths and expected outputs that runs in CI.

#### Scenario: Agent skill only
- **WHEN** a pull request changes only `skills/opentodo-cli/SKILL.md`
- **THEN** the filter reports `code=true` and the Go tests run

#### Scenario: Docs only
- **WHEN** a pull request changes only files under `docs/` and the generated in-app help
- **THEN** the filter reports `code=false` and `docs=true`
