# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Method vocabulary in the bundle
The bundle SHALL include `method.json`, which holds the Open Loops vocabulary of that version: each move, principle, Place, Rhythm and Horizon with its id, its name and its one-sentence description in every shipped language, and the screen and keyboard shortcut that serve each move. It SHALL be generated from the app's own definitions at build time, so it can never differ from the app of that version. Its fields SHALL only be added, and it SHALL carry a schema version.

#### Scenario: Same words on the website
- **WHEN** the website renders its method page in Italian from a bundle
- **THEN** every move name equals the name the app of that version shows in Italian

#### Scenario: A renamed term
- **WHEN** a release changes the English description of the move `place`
- **THEN** the next bundle's `method.json` carries the new description under the same id
