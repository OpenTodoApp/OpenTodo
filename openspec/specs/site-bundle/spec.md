# site-bundle Specification

## Purpose
Defines the versioned artefact each release publishes for the public website (docs site, screenshots, design tokens, icons, changelog and a feature manifest), so the website lives in its own repository and always describes a released version.

## Requirements

### Requirement: Site bundle on every release
Every release SHALL attach one archive named `opentodo-site-bundle-<version>.tar.gz` to its release page, built by CI from the tagged commit. The archive SHALL contain the generated documentation website, the product screenshots in light and dark, the colour tokens as a standalone stylesheet, the icon set, the changelog as structured data and a feature manifest, all describing that version.

#### Scenario: Release tag
- **WHEN** the tag `v0.4.0` is pushed
- **THEN** the release `v0.4.0` lists `opentodo-site-bundle-v0.4.0.tar.gz`, and its docs pages state version 0.4.0

#### Scenario: Build failure
- **WHEN** generating the docs site fails during the release job
- **THEN** the release is not published, and the job names the failing step

### Requirement: Feature manifest
The bundle SHALL include a manifest with the version, the release date, the import formats the version supports, and a list of named facts the website shows conditionally. Fields SHALL only be added, never renamed or removed, and the manifest SHALL carry a schema version. Among the facts, `method` SHALL list the Open Loops features the version ships, as stable ids: `vocabulary`, `modes`, `loop-home`, `next`, `waiting`, `project-walk`, `daily-check`, `monthly-look`.

#### Scenario: Website reads released importers
- **WHEN** the website builds against a bundle whose manifest lists `todoist-csv` but not `linear-csv`
- **THEN** it can show "Switch from Todoist" and withhold "Switch from Linear" from the manifest alone

#### Scenario: Older website, newer manifest
- **WHEN** a manifest gains a new field
- **THEN** a website built against the previous schema version still reads every field it knew

#### Scenario: Website gates the method page
- **WHEN** the website builds against a bundle whose `method` fact lacks `monthly-look`
- **THEN** it can describe the Daily check and the weekly review and withhold the Monthly look from the manifest alone

### Requirement: Preview bundle for unreleased changes
Every successful CI run on the main branch SHALL produce the same bundle, versioned with the commit, as a downloadable workflow artefact that is not attached to any release.

#### Scenario: Website preview of upcoming docs
- **WHEN** a docs page is changed on main
- **THEN** the run's artefacts include a bundle whose docs site contains the change, while the latest release's bundle does not

### Requirement: Stable bundle layout
The paths inside the bundle SHALL be documented and SHALL change only in a release that states it in the changelog. A path removed or renamed SHALL be kept for at least one more release.

#### Scenario: Renamed screenshot folder
- **WHEN** a release renames the screenshots folder inside the bundle
- **THEN** that release's bundle contains both the old and the new folder, and its changelog names the change

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

### Requirement: Method vocabulary in the bundle
The bundle SHALL include `method.json`, which holds the Open Loops vocabulary of that version: each move, principle, Place, Rhythm and Horizon with its id, its name and its one-sentence description in every shipped language, and the screen and keyboard shortcut that serve each move. It SHALL be generated from the app's own definitions at build time, so it can never differ from the app of that version. Its fields SHALL only be added, and it SHALL carry a schema version.

#### Scenario: Same words on the website
- **WHEN** the website renders its method page in Italian from a bundle
- **THEN** every move name equals the name the app of that version shows in Italian

#### Scenario: A renamed term
- **WHEN** a release changes the English description of the move `place`
- **THEN** the next bundle's `method.json` carries the new description under the same id
