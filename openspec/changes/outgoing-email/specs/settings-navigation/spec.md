# Spec Delta

## MODIFIED Requirements

### Requirement: Sections follow the user's role
Each panel SHALL be shown to the same roles as before. The Server group SHALL be listed only to the owner and admins. Administration (users, invitations, members) is for the owner and admins; its Outgoing email panel is for the owner only and is absent for admins. Backups and Access policies (two-factor policy, single sign-on, project invite links) are for the owner only, and so is the audit log in Activity. Opening a section the role does not see SHALL show the overview.

#### Scenario: Member and administration
- **WHEN** a member opens `/settings/admin`
- **THEN** the overview is shown and it has no Server group

#### Scenario: Admin sees administration
- **WHEN** an admin opens Settings
- **THEN** the Server group lists Administration only, which shows users and members and no Outgoing email panel, and `/settings/access` and `/settings/backups` show the overview

#### Scenario: Owner sees outgoing email
- **WHEN** the owner opens `/settings/admin`
- **THEN** the Outgoing email panel is shown after users and members, and the overview describes Administration as users, invitations, members and outgoing email

#### Scenario: Owner-only backups
- **WHEN** the owner opens Settings
- **THEN** the Server group lists Administration, Backups and Access policies, and `/settings/backups` shows the Backups panel

#### Scenario: Owner-only audit log
- **WHEN** a member opens `/settings/activity`
- **THEN** the Recent activity panel is shown and no Audit log panel
