# Spec Delta

## ADDED Requirements

### Requirement: Browser extension language
The extension's name, description, context-menu entry, shortcut description and options page SHALL be shown in the browser's interface language when it is one of the shipped languages (OpenSpec `localization`), else in English. The extension SHALL NOT learn or store the account's language preference; it keeps storing only the server URL and making no requests.

#### Scenario: French browser
- **WHEN** the browser's interface language is French and the user right-clicks a page
- **THEN** the menu entry reads `Ajouter à OpenTodo` and the options page is in French

#### Scenario: Browser language not shipped
- **WHEN** the browser's interface language is Japanese
- **THEN** the extension's texts are English and the capture works as usual

#### Scenario: Account language differs from the browser
- **WHEN** the account's interface language is German and the browser's is English
- **THEN** the extension's texts are English, and the capture screen it opens is in German because it is rendered by the app
