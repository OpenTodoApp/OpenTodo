## ADDED Requirements

### Requirement: Template library in the bundle
The bundle SHALL include the release's template library under `templates/`: an `index.json` listing every template's slug, category, icon and title and summary in every language it is translated into, and one `<slug>.json` per template with its full metadata, its text in English and in each translation, and its structure (labels, projects, sections, tasks and subtasks) with due dates as relative offsets. Both SHALL be generated from the repository's `templates/` folder when the bundle is built, so they never differ from the library the app of that version ships, SHALL carry a schema version and SHALL only gain fields. The manifest's facts SHALL include `templates`, the list of slugs in the library.

#### Scenario: Website builds a template page
- **WHEN** the website builds against a bundle whose `templates/index.json` lists `trip-planning`
- **THEN** it can render the "Trip planning" page and produce its downloadable template file from `templates/trip-planning.json` alone

#### Scenario: Template removed from the library
- **WHEN** a release removes a template from `templates/`
- **THEN** that release's bundle no longer lists it in `index.json` or in the `templates` fact, and its changelog names the removal

#### Scenario: Invalid library
- **WHEN** a template in `templates/` fails validation while the bundle is built
- **THEN** the bundle build fails and names the template
