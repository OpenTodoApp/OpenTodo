## ADDED Requirements

### Requirement: Home Assistant add-on
The repository SHALL include a Home Assistant add-on repository in `deploy/homeassistant/upstream/`, published as `pixari/opentodo-homeassistant-addons`, whose add-on runs the OpenTodo binary of the latest release on Home Assistant OS and Supervised installations for amd64 and aarch64, keeps its data in the add-on's `/data`, offers the essential variables of the deployment facts as options with the catalogue's defaults and descriptions, requires none, and is opened on a published port rather than through Ingress. A checker SHALL verify the add-on against the deployment facts and the latest release.

#### Scenario: Install and open
- **WHEN** a user adds the repository URL in Home Assistant, installs the OpenTodo add-on, starts it and clicks Open Web UI
- **THEN** OpenTodo opens on port 8080 of the Home Assistant machine and the first visitor gets the owner setup screen, while later visitors cannot register

#### Scenario: Options reach OpenTodo
- **WHEN** the user sets `allow_signup`, `base_url` or `log_level` and restarts the add-on
- **THEN** OpenTodo runs with the matching `OPENTODO_*` values, and an option left empty keeps OpenTodo's default

#### Scenario: Data survives a restart and is in the backup
- **WHEN** the add-on is restarted, or a Home Assistant backup that includes it is restored
- **THEN** every account and task is still there, and the backup was taken with the add-on stopped so the database is consistent

#### Scenario: A release becomes an update
- **WHEN** OpenTodo publishes a release that is not a pre-release
- **THEN** the add-on repository publishes images for that version before its `version` changes, and Home Assistant offers the update

#### Scenario: A stale add-on fails the check
- **WHEN** `CHANGELOG.md` names a newer release than the add-on's `version` or the OpenTodo version in its `Dockerfile`, or an option is missing or has a default that differs from the catalogue
- **THEN** `make check` fails and names the problem
