# Spec Delta

## ADDED Requirements

### Requirement: Project descriptions from other formats
When a JSON import format carries projects with a description (`description`, `notes` or `note` on a project object), the importer SHALL set the created project's `description` to that text. A project matched by name and reused SHALL keep its existing description. The description SHALL be written as an ordinary operation of the import job, so devices receive it on their next sync and a device that later opens the project folds it into the project's note document.

#### Scenario: New project with a description
- **WHEN** a `json-generic` file lists a project `{"name": "Trip", "description": "Flights booked, hotel pending"}` and the account has no project named Trip
- **THEN** the preview shows the project row as `create` and the imported project's description is "Flights booked, hotel pending"

#### Scenario: Existing project keeps its note
- **WHEN** the same file is imported into an account that already has a live project named "trip" with its own note
- **THEN** the project is reused, its note is unchanged, and no description operation is written for it

#### Scenario: Undo removes the description with the project
- **WHEN** the import that created "Trip" is undone
- **THEN** the project and its description are removed as one import, leaving nothing behind
