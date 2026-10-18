## ADDED Requirements

### Requirement: Templates for general container platforms
The repository SHALL include a checked template and a guide for Kubernetes (a Helm chart), Podman Quadlet, CapRover, Fly.io, Render and Synology Container Manager, each in `deploy/<platform>/` with a checker that applies the shared deployment facts and the image policy of that platform. Each template SHALL run a single instance with persistent storage on `/data` writable by the user the container runs as, the health check, closed sign-up by default and no required setting.

#### Scenario: Start from the template
- **WHEN** a user deploys OpenTodo with the template for their platform and opens it
- **THEN** the container becomes healthy and the first visitor gets the owner setup screen, while later visitors cannot register

#### Scenario: Data survives a redeploy
- **WHEN** the app is redeployed, updated or restarted on the platform
- **THEN** the same `/data` storage is mounted and every account and task is still there

#### Scenario: One writer
- **WHEN** a platform could run several instances or roll a new one before stopping the old one
- **THEN** the template runs exactly one instance and replaces it by stopping the old one first, because SQLite has one writer

### Requirement: Helm chart publishing
Every release that is not a pre-release SHALL publish the Helm chart as an OCI artifact under `oci://ghcr.io/pixari/charts`, and pull requests that change the chart SHALL lint it.

#### Scenario: A release publishes the chart
- **WHEN** the tag `v0.7.0` is pushed
- **THEN** a chart version for that release can be installed with `helm install` from `oci://ghcr.io/pixari/charts/opentodo`

#### Scenario: A broken chart is caught
- **WHEN** a pull request changes `deploy/helm/` so that the chart no longer lints or renders
- **THEN** the pull request's checks fail
