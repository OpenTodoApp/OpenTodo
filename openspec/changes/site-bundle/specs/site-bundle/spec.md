# Spec Delta

## Purpose

Defines the versioned artefact each release publishes for the public website (docs site, screenshots, design tokens, icons, changelog and a feature manifest), so the website lives in its own repository and always describes a released version.

## ADDED Requirements

### Requirement: Site bundle on every release
Every release SHALL attach one archive named `opentodo-site-bundle-<version>.tar.gz` to its release page, built by CI from the tagged commit. The archive SHALL contain the generated documentation website, the product screenshots in light and dark, the colour tokens as a standalone stylesheet, the icon set, the changelog as structured data and a feature manifest, all describing that version.

#### Scenario: Release tag
- **WHEN** the tag `v0.4.0` is pushed
- **THEN** the release `v0.4.0` lists `opentodo-site-bundle-v0.4.0.tar.gz`, and its docs pages state version 0.4.0

#### Scenario: Build failure
- **WHEN** generating the docs site fails during the release job
- **THEN** the release is not published, and the job names the failing step

### Requirement: Feature manifest
The bundle SHALL include a manifest with the version, the release date, the import formats the version supports, and a list of named facts the website shows conditionally. Fields SHALL only be added, never renamed or removed, and the manifest SHALL carry a schema version.

#### Scenario: Website reads released importers
- **WHEN** the website builds against a bundle whose manifest lists `todoist-csv` but not `linear-csv`
- **THEN** it can show "Switch from Todoist" and withhold "Switch from Linear" from the manifest alone

#### Scenario: Older website, newer manifest
- **WHEN** a manifest gains a new field
- **THEN** a website built against the previous schema version still reads every field it knew

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
