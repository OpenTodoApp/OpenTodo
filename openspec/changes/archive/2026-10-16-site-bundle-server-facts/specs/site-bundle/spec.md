## ADDED Requirements

### Requirement: Server facts in the manifest
The manifest's facts SHALL include the image platforms (`architectures`), the HTTP `port`, the data folder (`dataDir`), the `database`, the `license`, and the export format name and version (`exportFormat`, `exportFormatVersion`). Each SHALL be read from the repository's own source when the bundle is built (the release workflow, the Dockerfile, the export route, LICENSE), never typed into the bundle script; a source that cannot be read SHALL fail the bundle build naming it.

#### Scenario: Facts of a release
- **WHEN** the bundle of a release is built
- **THEN** its manifest lists `architectures: ["linux/amd64", "linux/arm64"]`, `port: 8080`, `dataDir: "/data"`, `database: "SQLite"`, `license: "AGPL-3.0"`, `exportFormat: "opentodo-export"` and `exportFormatVersion: 1`

#### Scenario: A source changes
- **WHEN** the Dockerfile exposes another port
- **THEN** the next bundle's `port` fact is that port, with no other edit

#### Scenario: Source missing
- **WHEN** the export route no longer states its format version
- **THEN** the bundle build fails and names the export route

### Requirement: Website icons in the sprite
The bundle's icon sprite and `names.json` SHALL include, besides the app's icons, the website-only icons listed in the repository, each once, under the same `icon-<name>` ids and licence. The app's own code SHALL NOT include the website-only icons.

#### Scenario: Website icon available
- **WHEN** the website draws the `server` icon on its self-host page
- **THEN** the pinned bundle's sprite has `icon-server` and `names.json` lists it

#### Scenario: Listed twice
- **WHEN** an icon is both an app icon and in the website list
- **THEN** the bundle test fails asking to drop it from the website list
