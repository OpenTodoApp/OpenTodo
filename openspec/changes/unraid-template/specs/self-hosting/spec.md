## ADDED Requirements

### Requirement: Shared deployment facts
The repository SHALL keep the facts every platform template must agree on in one file: image, container port, data directory, health check, and a catalogue of the optional `OPENTODO_*` variables a template may offer, each with its default and description, marking the ones every template must offer.

#### Scenario: A template drifts from the facts
- **WHEN** a platform template names another port, mounts something other than the data directory, offers a variable missing from the catalogue, or gives a catalogued variable a different default
- **THEN** `make check` fails and names the template and the problem

#### Scenario: A platform without a check
- **WHEN** a folder for a new platform is added under `deploy/` without its checker
- **THEN** `make check` fails and names the folder

### Requirement: Unraid Community Applications template
The repository SHALL include an Unraid Community Applications template for the release image line, with the web port 8080, an appdata path on `/data`, the Web UI link, icon and overview, and the essential optional variables with descriptions. No variable SHALL be required.

#### Scenario: Install from the template
- **WHEN** an Unraid user adds the container from the template and changes nothing
- **THEN** the container starts healthy, the Web UI link opens the app on the host's address, the first visitor creates the owner, and tasks added there are saved on the server

#### Scenario: Data survives an update
- **WHEN** the container is updated to a new image of the same release line
- **THEN** the same appdata path is mounted, migrations run on start, and all accounts and tasks are still present

## MODIFIED Requirements

### Requirement: Template conformance check
An automated check run by `make check` SHALL fail when any platform template breaks its platform's conventions or the shared deployment facts, when its image tag does not match the latest release in the changelog, when it names an `OPENTODO_*` variable the server does not read, or when the Coolify upstream copy differs from the Coolify template.

#### Scenario: Template drifts from the release or the server
- **WHEN** the template's image tag differs from the latest release line in `CHANGELOG.md`, the health check or the `/data` volume is missing, a `build:` key appears, or it names an `OPENTODO_*` variable the server does not read
- **THEN** `make check` fails and names the problem

#### Scenario: A release bumps every template
- **WHEN** a release is prepared and one platform template still names the previous release line
- **THEN** `make check` fails and names that template
