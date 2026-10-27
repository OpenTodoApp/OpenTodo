# Spec Delta

## MODIFIED Requirements

### Requirement: Settings sections and routes
Settings SHALL be split into sections at `/settings/<id>`: `account`, `workspaces`, `appearance`, `general`, `language`, `notifications`, `capture`, `plugins`, `about`, `integrations`, `data`, `people` and `server`, and sections with sub-pages SHALL have them at `/settings/<id>/<page>`. `/settings` SHALL open the first visible section from 1024 px wide and the section list below it; `/settings/import` SHALL keep the import screen. An unknown section SHALL open the first visible section. Sections are client screens and open offline; rows that need the server show their offline state inside the section.

#### Scenario: Deep link
- **WHEN** a signed-in user opens `/settings/integrations` directly or reloads it
- **THEN** the Integrations section is shown with its calendar apps, webhooks, API tokens, MCP and assistant pages

#### Scenario: Back and forward
- **WHEN** a user opens General, then Integrations, then presses the browser's back button
- **THEN** General is shown again, and forward returns to Integrations

#### Scenario: Unknown section
- **WHEN** a user opens `/settings/nonsense`
- **THEN** the Account section is shown and the address becomes `/settings/account`

#### Scenario: Back from linking a provider
- **WHEN** a user finishes linking a single sign-on identity from Linked accounts
- **THEN** the browser returns to `/settings/account/security` and the Linked accounts row confirms the link

#### Scenario: Import keeps its address
- **WHEN** a user opens `/settings/import`
- **THEN** the import screen opens as before, and its back link leads to the Data section

#### Scenario: Offline section
- **WHEN** a user opens `/settings/account/security` without a network connection
- **THEN** the page opens, and each row that needs the server shows that it needs a connection instead of stale or empty data

### Requirement: Settings groups
The section list SHALL show sections in this order and in these groups. You: Account, Workspaces, Appearance. App: General, Language and region, Notifications, Capture, Plugins, About. Data: Integrations, Data. Server: People, Server. Groups SHALL be labelled headings, a group with no visible section SHALL be omitted, and each group's list SHALL be exposed to assistive technology under its heading.

#### Scenario: Group headings for screen readers
- **WHEN** a screen reader user moves through the list
- **THEN** each group is announced by its heading before its section links, and the Server group is absent for a member

#### Scenario: Owner order
- **WHEN** the owner opens the list
- **THEN** the thirteen sections appear in the four groups in the stated order
