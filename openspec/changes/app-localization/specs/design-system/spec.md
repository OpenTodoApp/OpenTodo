# Spec Delta

## MODIFIED Requirements

### Requirement: Design workbench
The repository SHALL include a design workbench that runs locally with one command. It SHALL show the foundations (colours with their contrast, type scale, spacing, radii, elevation, motion) and SHALL have a story for every shared UI primitive and pattern, in light and dark. It SHALL offer a switch over the shipped interface languages (OpenSpec `localization`). The workbench SHALL be a development tool only and SHALL add nothing to the shipped app or server.

#### Scenario: Contributor opens the workbench
- **WHEN** a contributor runs the workbench command in `web/`
- **THEN** a local site opens listing Foundations and every shared component, each viewable in light and dark and at phone and desktop widths

#### Scenario: Production build untouched
- **WHEN** the production web app is built
- **THEN** no workbench code or dependency is included in the output

#### Scenario: Story in German
- **WHEN** a contributor switches the workbench language to German on the settings-section story at phone width
- **THEN** the story renders with the German catalog and its layout is unchanged except for text length
