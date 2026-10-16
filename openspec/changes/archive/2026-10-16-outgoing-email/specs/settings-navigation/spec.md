# Spec Delta

## MODIFIED Requirements

### Requirement: Sections follow the user's role
Each row SHALL be shown to the same roles as before. People (users, invitations, members, access policies, single sign-on) SHALL be listed to the owner and admins; access policies and single sign-on inside it, and the Server section (backups, attachments, outgoing email, audit log), SHALL be shown to the owner only. The Outgoing email card SHALL sit on the Server page between Attachments and the audit log, and its state (configured or not, the server and From address, the last test) SHALL read as a badge and text beside its row's label. Opening a section the role does not see SHALL open the first visible section.

#### Scenario: Member and administration
- **WHEN** a member opens `/settings/people`
- **THEN** the Account section is shown and the list has no People or Server entry

#### Scenario: Admin sees administration
- **WHEN** an admin opens Settings
- **THEN** the list shows People with users, invitations and members only, and no Server entry

#### Scenario: Owner-only backups
- **WHEN** the owner opens Settings
- **THEN** the list shows People with access policies and single sign-on, and Server with backups, attachments, outgoing email and the audit log

#### Scenario: Owner sees outgoing email
- **WHEN** the owner opens `/settings/server`
- **THEN** the Outgoing email card is shown after Attachments and before the audit log, the list describes Server as backups, attachments, outgoing email and the audit log, and searching Settings for "SMTP" or "outgoing email" opens that card

#### Scenario: Owner-only audit log
- **WHEN** an admin opens `/settings/server`
- **THEN** the Account section is shown and no audit log and no Outgoing email card is reachable anywhere in Settings

### Requirement: Help links name the same screens
Each Settings page SHALL have one Help action in its page header that opens the contextual help at the page's screen id (`settings/<id>`); the former per-panel screen ids SHALL resolve to anchors inside that page's guide, so old links keep working. The user guide SHALL describe Settings by section, and UI text naming a place in Settings SHALL use the section path, for example "Settings → Account → Two-factor authentication".

#### Scenario: Help from a section
- **WHEN** a user opens Help on the Integrations page
- **THEN** the integrations guide opens beside the page, which stays as it was

#### Scenario: Moved panel keeps its screen id
- **WHEN** something opens contextual help for screen `settings/two-factor`
- **THEN** the Account guide opens at its two-factor section

#### Scenario: Outgoing email help
- **WHEN** something opens contextual help for screen `settings/outgoing-email`
- **THEN** the Server guide opens at its Server section, which describes the Outgoing email card
