# Spec Delta

## ADDED Requirements

### Requirement: About section
Settings SHALL have an About section, visible to every account, that shows the server's version while online and a link to the in-app Help, the documentation on the website, the website, the issue tracker on GitHub and the source code, and a Buy Me a Coffee button. External links SHALL open in a new tab and load nothing into the app. For the owner it SHALL also offer to show the welcome note again.

#### Scenario: Member opens About
- **WHEN** a member opens `/settings/about` while online
- **THEN** the page shows "OpenTodo <version>", Open Help, the documentation, website, issue and GitHub links and the coffee button, and no welcome note row

#### Scenario: Owner reopens the welcome note
- **WHEN** the owner chooses Show it again in Settings → About
- **THEN** the welcome note opens, and closing it leaves Settings as it was

## MODIFIED Requirements

### Requirement: Settings sections and routes
Settings SHALL be split into sections at `/settings/<id>`: `account`, `appearance`, `general`, `notifications`, `capture`, `about`, `integrations`, `data`, `people` and `server`. `/settings` SHALL open the first visible section from 1024 px wide and the section list below it; `/settings/import` SHALL keep the import screen. An unknown section SHALL open the first visible section. Sections are client screens and open offline; rows that need the server show their offline state inside the section.

#### Scenario: Deep link
- **WHEN** a signed-in user opens `/settings/integrations` directly or reloads it
- **THEN** the Integrations section is shown with its calendar apps, webhooks, API tokens, MCP and assistant sections

#### Scenario: Back and forward
- **WHEN** a user opens General, then Integrations, then presses the browser's back button
- **THEN** General is shown again, and forward returns to Integrations

#### Scenario: Unknown section
- **WHEN** a user opens `/settings/nonsense`
- **THEN** the Account section is shown and the address becomes `/settings/account`

#### Scenario: Back from linking a provider
- **WHEN** a user finishes linking a single sign-on identity from Linked accounts
- **THEN** the browser returns to `/settings/account` and the Linked accounts row confirms the link

#### Scenario: Import keeps its address
- **WHEN** a user opens `/settings/import`
- **THEN** the import screen opens as before, and its back link leads to the Data section

#### Scenario: Offline section
- **WHEN** a user opens `/settings/account` without a network connection
- **THEN** the section opens, and each row that needs the server shows that it needs a connection instead of stale or empty data

### Requirement: Settings groups
The section list SHALL show sections in this order and in these groups. You: Account, Appearance. App: General, Notifications, Capture, About. Data: Integrations, Data. Server: People, Server. Groups SHALL be labelled headings, a group with no visible section SHALL be omitted, and each group's list SHALL be exposed to assistive technology under its heading.

#### Scenario: Group headings for screen readers
- **WHEN** a screen reader user moves through the list
- **THEN** each group is announced by its heading before its section links, and the Server group is absent for a member

#### Scenario: Owner order
- **WHEN** the owner opens the list
- **THEN** the ten sections appear in the four groups in the stated order
