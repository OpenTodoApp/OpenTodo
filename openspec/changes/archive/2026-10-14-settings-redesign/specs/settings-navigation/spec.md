## MODIFIED Requirements

### Requirement: Settings sections and routes
Settings SHALL be split into sections at `/settings/<id>`: `account`, `security`, `encryption`, `activity`, `preferences`, `notifications`, `capture`, `projects`, `data`, `integrations`, `ai`, `admin`, `backups` and `access`. `/settings` SHALL show the overview and `/settings/import` the import screen. An unknown section SHALL show the overview. Sections are client screens and open offline; panels that need the server show their offline state inside the section.

#### Scenario: Deep link
- **WHEN** a signed-in user opens `/settings/integrations` directly or reloads it
- **THEN** the Integrations section is shown with its calendar apps, webhooks and API tokens panels

#### Scenario: Back and forward
- **WHEN** a user opens the overview, then AI, then presses the browser's back button
- **THEN** the overview is shown again, and forward returns to AI

#### Scenario: Unknown section
- **WHEN** a user opens `/settings/nonsense`
- **THEN** the overview is shown

#### Scenario: Back from linking a provider
- **WHEN** a user finishes linking a single sign-on identity from Linked accounts
- **THEN** the browser returns to `/settings/security` and the Linked accounts panel confirms the link

#### Scenario: Import keeps its address
- **WHEN** a user opens `/settings/import`
- **THEN** the import screen opens as before, and its back link leads to the Data section

#### Scenario: Offline section
- **WHEN** a user opens `/settings/security` without a network connection
- **THEN** the section opens, and each panel that needs the server shows that it needs a connection instead of stale or empty data

### Requirement: Settings overview
The overview SHALL start with a profile card showing the account's initials, name, email and role, followed by a link to Help. It SHALL list the sections the user may see in their groups, each entry with an icon, name and one-line description, and end with the free-software line linking to the source. Each entry SHALL be a link at least 44 px tall that opens its section.

#### Scenario: Phone overview
- **WHEN** a member opens `/settings` on a 390 px wide screen
- **THEN** they see the profile card, then the groups You, App and Data and connections with their sections as tappable rows with icons and descriptions, no Server group, and the footer line

#### Scenario: Opening a section
- **WHEN** the user activates the Capture entry
- **THEN** the address becomes `/settings/capture` and the Capture section is shown

### Requirement: Section page layout
A section page SHALL have one level-one heading with the section's name, and its panels SHALL keep their own headings below it. From 1024 px wide the grouped navigation list of all visible sections SHALL sit beside the content, with the current one marked `aria-current="page"`. Below 1024 px the page SHALL start with a link back to the overview. On navigation, focus SHALL move to the section heading. Every control SHALL stay reachable by keyboard.

#### Scenario: Desktop section
- **WHEN** a user opens `/settings/preferences` on a 1200 px wide screen
- **THEN** the grouped section list is shown beside the Preferences panels with group headings, an icon per section, and Preferences marked as the current page

#### Scenario: Phone section
- **WHEN** a user opens `/settings/data` on a 390 px wide screen
- **THEN** a "Settings" back link leads to the overview and no section list is shown beside the content

#### Scenario: Focus after navigation
- **WHEN** a keyboard user activates the Notifications entry
- **THEN** focus is on the "Notifications" heading of the new page

### Requirement: Sections follow the user's role
Each panel SHALL be shown to the same roles as before. The Server group SHALL be listed only to the owner and admins. Administration (users, invitations, members) is for the owner and admins. Backups and Access policies (two-factor policy, single sign-on, project invite links) are for the owner only, and so is the audit log in Activity. Opening a section the role does not see SHALL show the overview.

#### Scenario: Member and administration
- **WHEN** a member opens `/settings/admin`
- **THEN** the overview is shown and it has no Server group

#### Scenario: Admin sees administration
- **WHEN** an admin opens Settings
- **THEN** the Server group lists Administration only, which shows users and members, and `/settings/access` and `/settings/backups` show the overview

#### Scenario: Owner-only backups
- **WHEN** the owner opens Settings
- **THEN** the Server group lists Administration, Backups and Access policies, and `/settings/backups` shows the Backups panel

#### Scenario: Owner-only audit log
- **WHEN** a member opens `/settings/activity`
- **THEN** the Recent activity panel is shown and no Audit log panel

### Requirement: Demo instance sections
On a demo instance each section SHALL show the panels the demo allows, plus the existing note naming the refused features of that section in place of their panels. A section whose panels are all refused SHALL show only that note, never an empty page. Security, Encryption, Notifications, Integrations, AI, Administration, Backups and Access policies are fully refused on the demo. Import stays disabled with its note.

#### Scenario: Integrations on the demo
- **WHEN** a sandbox opens `/settings/integrations`
- **THEN** it shows the demo note naming calendar apps, webhooks and API tokens, and none of their panels

#### Scenario: General on the demo
- **WHEN** a sandbox opens `/settings/general`, which shows Preferences, and then `/settings/capture`
- **THEN** start view, calendar and keyboard settings work as on any server, and Capture shows quick add, voice and the bookmarklet with the demo note in place of email to task

#### Scenario: Security on the demo
- **WHEN** a sandbox opens `/settings/security`
- **THEN** it shows only the demo note naming password and two-factor authentication, passkeys and linked accounts

### Requirement: Help links name the same screens
Every Settings panel SHALL keep its Help link and screen id (`settings/...`) wherever it now lives, so contextual help opens the same guide section. The user guide SHALL describe Settings by section, and UI text naming a place in Settings SHALL use the section path, for example "Settings → Security → Two-factor authentication".

#### Scenario: Help from a section
- **WHEN** a user opens Help on the Webhooks panel in the Integrations section
- **THEN** the webhooks guide opens beside the section, which stays as it was

#### Scenario: Moved panel keeps its screen id
- **WHEN** a user opens Help on the Two-factor authentication panel in the Security section
- **THEN** the guide section for screen `settings/two-factor` opens, as it did from Account

## ADDED Requirements

### Requirement: Settings groups
The overview and the side navigation SHALL show sections in this order and in these groups. You: Account, Security, Encryption, Activity. App: Preferences, Notifications, Capture, Projects. Data and connections: Data, Integrations, AI. Server: Administration, Backups, Access policies. Groups SHALL be labelled headings, a group with no visible section SHALL be omitted, and each group's list SHALL be exposed to assistive technology under its heading.

#### Scenario: Group headings for screen readers
- **WHEN** a screen reader user moves through the overview
- **THEN** each group is announced by its heading before its section links, and the Server group is absent for a member

#### Scenario: Owner order
- **WHEN** the owner opens the overview
- **THEN** the fourteen sections appear in the four groups in the stated order

### Requirement: Legacy settings addresses
`/settings/general` SHALL show the Preferences section and replace the address with `/settings/preferences` without adding a history entry. Links to the ids kept from the previous layout (`account`, `notifications`, `data`, `capture`, `integrations`, `ai`, `admin`) SHALL keep opening the section of that id.

#### Scenario: Old General link
- **WHEN** a user opens a bookmark to `/settings/general`
- **THEN** the Preferences section is shown, the address bar reads `/settings/preferences`, and pressing back leaves Settings instead of returning to `/settings/general`

#### Scenario: Old Account link
- **WHEN** a user opens `/settings/account`
- **THEN** the Account section is shown with the profile and sign-out panels

### Requirement: Panel cards and rows
Each Settings panel SHALL appear as a visually separated card with its heading, Help link and a one-line description. Individual settings SHALL be laid out as rows with label and description on one side and the control on the other. Below 640 px each row SHALL stack the control under its label. No row or card SHALL scroll sideways at 320 px wide.

#### Scenario: Wide row layout
- **WHEN** a user opens `/settings/preferences` on a 1200 px wide screen
- **THEN** the start view setting shows its label and description on the left and its control on the right, inside the Preferences card area, separated from neighbouring cards by visible space

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
