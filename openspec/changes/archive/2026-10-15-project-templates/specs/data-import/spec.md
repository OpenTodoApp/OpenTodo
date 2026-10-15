# Spec Delta

## ADDED Requirements

### Requirement: Template files in the importer
An own-export file that carries a top-level `template` object SHALL import like any own export: ids kept, existing ids skipped as `exists`, dates as written, the optional `template` key ignored for the data. The preview SHALL report that the file is a template and that "From a template" in the sidebar creates a fresh copy with shifted dates, so a user who wants a reusable copy is not sent through the importer twice.

#### Scenario: Template previewed in the importer
- **WHEN** a file with `format: "opentodo-export"` and `template.day` is uploaded for preview
- **THEN** the preview reports the format `opentodo`, lists its rows as `create`, and carries a note that the file is a template and where to start it as a new project

#### Scenario: Imported twice
- **WHEN** the same template file is imported a second time through the Import screen
- **THEN** every row is skipped with reason `exists` and nothing is created

#### Scenario: Unauthenticated preview
- **WHEN** a request without credentials posts a template file to the preview route
- **THEN** the response is 401 `unauthorized` and nothing is read
