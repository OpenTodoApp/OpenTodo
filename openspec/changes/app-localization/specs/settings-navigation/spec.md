# Spec Delta

## MODIFIED Requirements

### Requirement: Help links name the same screens
Every Settings panel SHALL keep its Help link and screen id (`settings/...`) wherever it now lives, so contextual help opens the same guide section. Screen ids SHALL NOT depend on the interface language. The user guide SHALL describe Settings by section, and UI text naming a place in Settings SHALL use the section path in the active language (OpenSpec `localization`), for example "Settings → Security → Two-factor authentication".

#### Scenario: Help from a section
- **WHEN** a user opens Help on the Webhooks panel in the Integrations section
- **THEN** the webhooks guide opens beside the section, which stays as it was

#### Scenario: Moved panel keeps its screen id
- **WHEN** a user opens Help on the Two-factor authentication panel in the Security section
- **THEN** the guide section for screen `settings/two-factor` opens, as it did from Account

#### Scenario: Section path in German
- **WHEN** the language is German and a message points the user to the two-factor settings
- **THEN** it reads `Einstellungen → Sicherheit → Zwei-Faktor-Authentifizierung`, and the Help link on that panel still opens the section for `settings/two-factor`
