## MODIFIED Requirements

### Requirement: Shipped languages and their catalogs
English, German, French, Spanish, Italian, Portuguese and Dutch SHALL be maintained in the repository and SHALL be complete in every release. A maintained language SHALL be offered in Settings only when its catalog is complete. A community language (see "Community languages") SHALL be offered when it meets that requirement's threshold. Shipped catalogs, maintained or community, SHALL be written and reviewed by people; machine translation SHALL NOT be used for a shipped catalog.

#### Scenario: Complete languages offered
- **WHEN** the user opens the Language panel
- **THEN** the seven maintained languages are listed, each in its own name, `Nederlands` among them

#### Scenario: Work-in-progress catalog
- **WHEN** a catalog in the repository is incomplete
- **THEN** it is not offered in Settings and the release check reports its missing messages

#### Scenario: Dutch interface
- **WHEN** the user picks `Nederlands` and opens Today with an overdue task
- **THEN** the headings, the row's due label, the quick-add placeholder and the row menu are in Dutch, the root element's `lang` is `nl`, and the task's title is as written

#### Scenario: Older client receives Dutch
- **WHEN** a device running a release without Dutch receives `language: "nl"` from another device
- **THEN** it behaves as `system` and keeps the stored value, and the newer device stays in Dutch

## ADDED Requirements

### Requirement: Community languages
A catalog SHALL be offered as a community language when it is listed as such, is at least 90 % complete (translated messages over source messages) and names a maintainer in the translation guide. The Language panel SHALL list community languages after the maintained ones, each in its own name with the caption "Community translation, some text in English". A message missing from a community catalog SHALL be shown in English. Text outside the web app (emails, channel messages, the native shell, the browser extension, quick-add vocabulary) MAY be missing for a community language and SHALL then be in English. The translation check SHALL fail when a listed community catalog falls below 90 %.

#### Scenario: Community language offered
- **WHEN** a Polish catalog is 94 % complete, listed as community and has a maintainer
- **THEN** the Language panel lists `Polski` after the maintained languages with the community caption, and picking it shows Polish with the missing 6 % in English

#### Scenario: Below the threshold
- **WHEN** a change adds 400 source messages and the listed Polish catalog drops to 85 %
- **THEN** the translation check fails, naming the language and its coverage

#### Scenario: Community language without quick-add vocabulary
- **WHEN** the interface language is a community language with no bundled vocabulary and the user enters `Pay rent tomorrow`
- **THEN** English vocabulary is active, the task is due tomorrow, and no error is shown

#### Scenario: Email in a community language
- **WHEN** a person whose app is in a community language without email templates is sent the weekly digest
- **THEN** the digest is in English

### Requirement: Language scaffolding and status
The repository SHALL provide one command that scaffolds every file a new language needs on every surface (web catalog, service worker notification texts, browser extension, native shell, email templates, channel messages, quick-add vocabulary stub) without listing the language as shipped and without changing any existing language, and one read-only command that reports, per language and per surface, how many messages are translated and which are missing. Neither command SHALL need a network connection or a new dependency.

#### Scenario: Scaffold a language
- **WHEN** a contributor runs the scaffold command for `sv` "Svenska"
- **THEN** the files for every surface exist, Settings does not offer Swedish, `make check` passes, and the status report lists Swedish at 0 % on every surface

#### Scenario: Existing code refused
- **WHEN** a contributor runs the scaffold command for `de`
- **THEN** it stops with an error naming the existing catalog and changes no file

#### Scenario: Status report
- **WHEN** a contributor runs the status command
- **THEN** it prints each language's translated and total counts for the web app, notifications, extension, shell, emails, channel messages and vocabulary, with the first missing keys, and exits successfully

### Requirement: Server-written text follows the maintained languages
Every text the server or a native shell writes for a person (emails, the weekly digest, notification channel messages, the service worker's notification texts, the browser extension and the native shell's own strings) SHALL exist in every maintained language. A check SHALL fail when a maintained language is missing from any of these surfaces.

#### Scenario: Dutch digest
- **WHEN** a person whose app is in Dutch has the weekly digest on
- **THEN** the digest's subject and text are in Dutch, and task titles are as written

#### Scenario: Surface forgotten
- **WHEN** a change lists a language as maintained without its email templates
- **THEN** the check fails, naming the language and the missing templates
