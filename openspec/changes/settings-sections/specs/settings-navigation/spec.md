# Spec Delta

## ADDED Requirements

### Requirement: Settings sections and routes
Settings SHALL be split into sections, each at its own address: Account `/settings/account`, General `/settings/general`, Notifications `/settings/notifications`, Data `/settings/data`, Capture `/settings/capture`, Integrations `/settings/integrations`, AI `/settings/ai` and Administration `/settings/admin`. `/settings` SHALL show the overview and `/settings/import` the import screen. An unknown section SHALL show the overview. Sections are client screens and open offline.

#### Scenario: Deep link
- **WHEN** a signed-in user opens `/settings/integrations` directly or reloads it
- **THEN** the Integrations section is shown with its calendar apps, webhooks and API tokens panels

#### Scenario: Back and forward
- **WHEN** a user opens the overview, then AI, then presses the browser's back button
- **THEN** the overview is shown again, and forward returns to AI

#### Scenario: Unknown section
- **WHEN** a user opens `/settings/nonsense`
- **THEN** the overview is shown

#### Scenario: Import keeps its address
- **WHEN** a user opens `/settings/import`
- **THEN** the import screen opens as before

### Requirement: Settings overview
The overview SHALL show the account's name, email and role, a link to Help, one entry per section the user may see with its name and a one-line description of what it holds, and the line stating that OpenTodo is free software without telemetry with a link to its source. Each entry SHALL be a link at least 44 px tall that opens its section.

#### Scenario: Phone overview
- **WHEN** a member opens `/settings` on a 390 px wide screen
- **THEN** they see Account, General, Notifications, Data, Capture, Integrations and AI as tappable rows with descriptions, and the footer line

#### Scenario: Opening a section
- **WHEN** the user activates the Capture entry
- **THEN** the address becomes `/settings/capture` and the Capture section is shown

### Requirement: Section page layout
A section page SHALL have one level-one heading with the section's name, and its panels SHALL keep their own headings below it. From 768 px wide a navigation list of all visible sections SHALL sit beside the content with the current one marked `aria-current="page"`; below 768 px the page SHALL start with a link back to the overview instead. On navigation, focus SHALL move to the section heading. Every control SHALL stay reachable by keyboard.

#### Scenario: Desktop section
- **WHEN** a user opens `/settings/general` on a 1200 px wide screen
- **THEN** the section list is shown beside the General panels with General marked as the current page

#### Scenario: Phone section
- **WHEN** a user opens `/settings/data` on a 390 px wide screen
- **THEN** a "Settings" back link leads to the overview and no section list is shown beside the content

#### Scenario: Focus after navigation
- **WHEN** a keyboard user activates the Notifications entry
- **THEN** focus is on the "Notifications" heading of the new page

### Requirement: Sections follow the user's role
Each panel SHALL be shown to the same roles as before the split: the Administration section (users, members, single sign-on) SHALL be listed and reachable only by the owner and admins, single sign-on and backups only by the owner, and the audit log only by the owner. Opening a section the role does not see SHALL show the overview.

#### Scenario: Member and administration
- **WHEN** a member opens `/settings/admin`
- **THEN** the overview is shown and it has no Administration entry

#### Scenario: Admin sees administration
- **WHEN** an admin opens Settings
- **THEN** Administration is listed and shows users and members, but not single sign-on

#### Scenario: Owner-only backups
- **WHEN** the owner opens the Data section
- **THEN** the Backups panel is shown, and a member's Data section has no Backups panel

### Requirement: Demo instance sections
On a demo instance each section SHALL show the panels the demo allows, and SHALL show the existing note that the refused features of that section are disabled on this demo instance, naming them, instead of their panels. A section whose panels are all refused SHALL show only that note, never an empty page. Import stays disabled with its note.

#### Scenario: Integrations on the demo
- **WHEN** a sandbox opens `/settings/integrations`
- **THEN** it shows the demo note naming calendar apps, webhooks and API tokens, and none of their panels

#### Scenario: General on the demo
- **WHEN** a sandbox opens `/settings/general`
- **THEN** the start view, keyboard, quick add, voice and projects settings work as on any server

### Requirement: Help links name the same screens
Every Settings panel SHALL keep its Help link and screen id (`settings/...`) after the split, so contextual help opens the same guide section. The user guide SHALL describe Settings by section, and UI text that names a place in Settings SHALL use the section path, for example "Settings → AI → AI assistants".

#### Scenario: Help from a section
- **WHEN** a user opens Help on the Webhooks panel in the Integrations section
- **THEN** the webhooks guide opens beside the section, which stays as it was
