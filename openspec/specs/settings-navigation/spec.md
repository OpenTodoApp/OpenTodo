# settings-navigation Specification

## Purpose
How the Settings screen is organised: an overview that lists sections, one page per section at `/settings/<section>`, a side list on wide screens and a back link on phones, role-based visibility that matches the panels, per-section demo notes, and Help links that keep their screen ids. It changes where settings appear, never what they do.

## Requirements

### Requirement: Settings sections and routes
Settings SHALL be split into sections at `/settings/<id>`: `account`, `appearance`, `general`, `notifications`, `capture`, `integrations`, `data`, `people` and `server`. `/settings` SHALL open the first visible section from 1024 px wide and the section list below it; `/settings/import` SHALL keep the import screen. An unknown section SHALL open the first visible section. Sections are client screens and open offline; rows that need the server show their offline state inside the section.

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

### Requirement: Settings overview
There SHALL be no separate overview page. The section list (profile card, search field, grouped sections with icon, name and one-line description, the free-software footer) SHALL be the left column from 1024 px wide and the whole screen below it, where each entry is a link at least 44 px tall that opens its section as a page.

#### Scenario: Phone overview
- **WHEN** a member opens `/settings` on a 390 px wide screen
- **THEN** they see the profile card, the search field, the groups You, App and Data with their sections as tappable rows, no Server group, and the footer line

#### Scenario: Opening a section
- **WHEN** the user activates the Capture entry
- **THEN** the address becomes `/settings/capture` and the Capture section is shown

#### Scenario: Desktop list
- **WHEN** the owner opens `/settings` on a 1280 px wide screen
- **THEN** the list is the left column, the Account section is open beside it, and the address is `/settings/account`

### Requirement: Section page layout
A section page SHALL use the page header with the section's name, and its sections SHALL keep their own headings below it. From 1024 px wide the grouped section list SHALL sit beside the content with the current one marked `aria-current="page"`; the layout SHALL be the same for every section. Below 1024 px the page header SHALL carry a back action to the list. On navigation, focus SHALL move to the section heading. Every control SHALL stay reachable by keyboard.

#### Scenario: Desktop section
- **WHEN** a user opens `/settings/general` on a 1200 px wide screen
- **THEN** the grouped section list is shown beside the General sections with group headings, an icon per section, and General marked as the current page

#### Scenario: Phone section
- **WHEN** a user opens `/settings/data` on a 390 px wide screen
- **THEN** the page header has a back action to the list and no section list is shown beside the content

#### Scenario: Focus after navigation
- **WHEN** a keyboard user activates the Notifications entry
- **THEN** focus is on the "Notifications" heading of the new page

### Requirement: Sections follow the user's role
Each row SHALL be shown to the same roles as before. People (users, invitations, members, access policies, single sign-on) SHALL be listed to the owner and admins; access policies and single sign-on inside it, and the Server section (backups, attachments, outgoing email, audit log), SHALL be shown to the owner only. Opening a section the role does not see SHALL open the first visible section.

#### Scenario: Member and administration
- **WHEN** a member opens `/settings/people`
- **THEN** the Account section is shown and the list has no People or Server entry

#### Scenario: Admin sees administration
- **WHEN** an admin opens Settings
- **THEN** the list shows People with users, invitations and members only, and no Server entry

#### Scenario: Owner-only backups
- **WHEN** the owner opens Settings
- **THEN** the list shows People with access policies and single sign-on, and Server with backups, attachments, outgoing email and the audit log

#### Scenario: Owner-only audit log
- **WHEN** an admin opens `/settings/server`
- **THEN** the Account section is shown and no audit log and no Outgoing email card is reachable anywhere in Settings

### Requirement: Outgoing email card on the Server page
The Outgoing email card SHALL sit on the Server page between Attachments and the audit log, and its state (configured or not, the server and From address, the last test) SHALL read as a badge and text beside its row's label.

#### Scenario: Owner sees outgoing email
- **WHEN** the owner opens `/settings/server`
- **THEN** the Outgoing email card is shown after Attachments and before the audit log, the list describes Server as backups, attachments, outgoing email and the audit log, and searching Settings for "SMTP" or "outgoing email" opens that card

### Requirement: Demo instance sections
On a demo instance every section SHALL be listed and every row shown; rows the demo refuses SHALL have their controls disabled with the existing demo note once at the top of the page naming them. No section SHALL be hidden or replaced by a note.

#### Scenario: Integrations on the demo
- **WHEN** a sandbox opens `/settings/integrations`
- **THEN** the page starts with the demo note naming calendar apps, webhooks and API tokens, and their rows are visible with disabled controls

#### Scenario: General on the demo
- **WHEN** a sandbox opens `/settings/general` and then `/settings/capture`
- **THEN** start view, calendar and keyboard settings work as on any server, and Capture shows quick add, voice and the bookmarklet working with email to task disabled under the note

#### Scenario: Security on the demo
- **WHEN** a sandbox opens `/settings/account`
- **THEN** the page starts with the demo note naming password and two-factor authentication, passkeys, linked accounts and encryption, and those rows are visible with disabled controls while profile and sessions work

### Requirement: Help links name the same screens
Every Settings panel SHALL keep its Help link and screen id (`settings/...`) wherever it now lives, so contextual help opens the same guide section. Screen ids SHALL NOT depend on the interface language. The user guide SHALL describe Settings by section, and UI text naming a place in Settings SHALL use the section path in the active language (OpenSpec `localization`), for example "Settings → Security → Two-factor authentication".

#### Scenario: Help from a section
- **WHEN** a user opens Help on the Webhooks panel in the Integrations section
- **THEN** the webhooks guide opens beside the section, which stays as it was

#### Scenario: Moved panel keeps its screen id
- **WHEN** a user opens Help on the Two-factor authentication panel in the Security section
- **THEN** the guide section for screen `settings/two-factor` opens, as it did from Account

#### Scenario: Outgoing email help
- **WHEN** something opens contextual help for screen `settings/outgoing-email`
- **THEN** the Server guide opens at its Server section, which describes the Outgoing email card

#### Scenario: Section path in German
- **WHEN** the language is German and a message points the user to the two-factor settings
- **THEN** it reads `Einstellungen → Sicherheit → Zwei-Faktor-Authentifizierung`, and the Help link on that panel still opens the section for `settings/two-factor`

### Requirement: Settings groups
The section list SHALL show sections in this order and in these groups. You: Account, Appearance. App: General, Notifications, Capture. Data: Integrations, Data. Server: People, Server. Groups SHALL be labelled headings, a group with no visible section SHALL be omitted, and each group's list SHALL be exposed to assistive technology under its heading.

#### Scenario: Group headings for screen readers
- **WHEN** a screen reader user moves through the list
- **THEN** each group is announced by its heading before its section links, and the Server group is absent for a member

#### Scenario: Owner order
- **WHEN** the owner opens the list
- **THEN** the nine sections appear in the four groups in the stated order

### Requirement: Account and General section contents
Account SHALL hold profile, sessions, password, two-factor, passkeys, linked accounts and encryption; General SHALL hold start view, date and time, calendar, keyboard and language.

#### Scenario: Where a setting lives
- **WHEN** the user looks for passkeys and for the date and time format
- **THEN** passkeys are found in the Account section and date and time in the General section

### Requirement: Legacy settings addresses
Addresses of earlier layouts SHALL open the section that now holds their content and replace the address without adding a history entry: `security`, `encryption` and `activity` → `account`; `preferences` → `general`; `projects` → `data`; `ai` → `integrations`; `admin` and `access` → `people`; `backups` → `server`. The ids kept (`account`, `general`, `notifications`, `capture`, `integrations`, `data`) SHALL keep opening the section of that id.

#### Scenario: Old General link
- **WHEN** a user opens a bookmark to `/settings/general`
- **THEN** the General section is shown with the start view, date and time, calendar, keyboard and language rows, and the address stays `/settings/general`

#### Scenario: Old Account link
- **WHEN** a user opens `/settings/account`
- **THEN** the Account section is shown with the profile, sessions and security rows

#### Scenario: Old Security link
- **WHEN** a user opens a bookmark to `/settings/security`
- **THEN** the Account section is shown scrolled to its security rows, the address bar reads `/settings/account`, and pressing back leaves Settings

#### Scenario: Old Preferences link
- **WHEN** a user opens `/settings/preferences`
- **THEN** the General section is shown and the address reads `/settings/general`

### Requirement: Panel cards and rows
Each Settings section SHALL appear as a card with the fixed anatomy of the design system: heading, one-sentence description, rows. Individual settings SHALL be rows with label and description on one side and the control on the other, state shown as a badge beside the label. Below 640 px each row SHALL stack the control under its label. No row or card SHALL scroll sideways at 320 px wide. Native select controls SHALL be styled as the design-system select.

#### Scenario: Wide row layout
- **WHEN** a user opens `/settings/general` on a 1200 px wide screen
- **THEN** the start view setting shows its label and description on the left and its control on the right, inside the General card area, separated from neighbouring cards by visible space

#### Scenario: Narrow row layout
- **WHEN** the same section is opened on a 320 px wide screen
- **THEN** every control sits below its label and the page has no horizontal scroll

### Requirement: State-first panel summaries
A panel whose feature has state SHALL lead with a summary of that state, taken only from data the app already holds or fetches for that panel, before any action. Examples: two-factor on or off with recovery codes left, the number of passkeys with each one's last use, push on or off for this device, and the last backup run with its outcome. A summary that needs the server SHALL show the panel's offline state instead of a guess.

#### Scenario: Two-factor summary
- **WHEN** a user with two-factor enabled and 7 recovery codes left opens Security
- **THEN** the Two-factor authentication card first reads that it is on with 7 of 10 recovery codes left, before its actions

#### Scenario: Few recovery codes
- **WHEN** the same user has 2 recovery codes left
- **THEN** the summary carries a warning badge and a visible action to generate new codes

#### Scenario: Summary offline
- **WHEN** the user opens Security offline
- **THEN** the Two-factor card states that it needs a connection and shows no on or off state

### Requirement: Forms open from actions
Multi-step or multi-field forms in Settings (change password, two-factor enrolment, new API token, new app password, new webhook, new invitation, single sign-on configuration) SHALL be closed by default and SHALL open from a clearly labelled action in a dialog or an inline expansion. Closing without saving SHALL discard the draft and return focus to the action that opened it.

#### Scenario: Change password
- **WHEN** a user opens Security
- **THEN** no password fields are visible until they activate "Change password", which opens the form with focus on its first field

#### Scenario: Cancel returns focus
- **WHEN** the user presses Escape in the new token dialog
- **THEN** the dialog closes without creating a token and focus returns to the "New token" button

### Requirement: Settings lists and empty states
Lists in Settings (passkeys, remembered browsers, linked identities, API tokens, app passwords, webhooks, invitations, users, backup runs, activity events) SHALL show one row per item with its name, its key metadata such as created and last used, and its actions in a per-row menu reachable by keyboard. An empty list SHALL show what the feature is for and its primary action instead of a blank area.

#### Scenario: Passkey row
- **WHEN** a user with two passkeys opens Security
- **THEN** each passkey is a row with its name, when it was created and last used, and a menu with Rename and Remove

#### Scenario: No tokens yet
- **WHEN** a user without API tokens opens Integrations
- **THEN** the API tokens card explains what tokens are for and offers "New token" instead of an empty list

### Requirement: Destructive actions confirm in a dialog
Destructive actions in Settings (for example disabling two-factor, removing a passkey, revoking a token, deleting a user, resetting encryption, signing out) SHALL be styled as dangerous, SHALL be placed after the card's other actions, and SHALL ask for confirmation in an in-app dialog that names what will be lost. The dialog SHALL default focus to Cancel, never to the destructive button.

#### Scenario: Revoke token
- **WHEN** a user chooses Revoke on an API token
- **THEN** a dialog names the token and says scripts using it will stop working, focus is on Cancel, and the token is revoked only after the user confirms

#### Scenario: Sign out
- **WHEN** a user activates Sign out in the Account section
- **THEN** a dialog explains that the local copy is cleared on this device after unsynced changes upload, and signing out proceeds only after confirmation

### Requirement: Settings search
The settings list SHALL start with a search field that filters sections and individual rows by label and description as the user types, showing matching rows under their section name; Enter on a result opens that section scrolled to the row with the row focused. The same index SHALL feed the command palette, so a setting is reachable by name from anywhere.

#### Scenario: Find a row
- **WHEN** the user types "week" in the settings search
- **THEN** "First day of the week" is listed under General, and Enter opens General with that row focused

#### Scenario: From the palette
- **WHEN** the user types "passkey" in the command palette
- **THEN** "Account › Passkeys" is listed and opens the Account section at the passkeys row
