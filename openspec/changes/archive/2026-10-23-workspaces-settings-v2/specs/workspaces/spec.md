## MODIFIED Requirements

### Requirement: Workspaces settings page
Settings → Workspaces SHALL list the user's workspaces with their role, open each one to rename it, choose its icon and colour, manage members (add by email, change role, remove), groups (create, rename, members, delete), invite links (create with a role and an expiry, copy once, send by email when configured, revoke), transfer and delete, with every action reachable by keyboard and with the actions disabled and explained while offline. From 768 px the list SHALL be a column beside the open workspace, the open one marked by more than a hover tint and announced as current; below 768 px choosing a workspace SHALL open it as its own view with a Back action to the list. The open workspace SHALL start with a header showing its mark, its name and its number of members, followed by tabs: General (name, colour, icon, and Transfer, Delete or Leave in a separated danger zone), Members, Groups and, for the owner and admins, Invites; the default workspace SHALL show General only. Groups SHALL list each group's name, its members' avatars and their count, and opening a group SHALL offer rename, a searchable member picker, each member with Remove, and Delete behind a confirmation that names the projects shared with the group. A member who is neither owner nor admin SHALL see the member and group lists read-only and a Leave action. The page SHALL use the standard settings patterns, with one Help action.

#### Scenario: Owner manages a workspace
- **WHEN** the owner opens Settings → Workspaces → Family
- **THEN** the page shows the name, icon and colour controls, the members with roles, the groups with their members, the pending invite links, and Transfer and Delete in a separated danger zone

#### Scenario: Member sees it read-only
- **WHEN** a `member` of Family opens it in Settings
- **THEN** the members and groups are listed without controls and a Leave action is offered

#### Scenario: Phone width
- **WHEN** the page is opened on a 360 px wide screen
- **THEN** no horizontal scrolling is needed, the member rows wrap their role control under the name, and every control is at least 44 × 44 px

#### Scenario: Offline
- **WHEN** the page is opened without a network
- **THEN** the cached lists are shown and the controls are disabled with a line saying workspaces need a connection

#### Scenario: Which workspace is open
- **WHEN** the owner of Family and Work opens Family at 1280 px
- **THEN** Family's row in the list carries the current marker and is announced as current, Work's row only tints on hover, and the detail's header reads "Family" with its mark and "3 members"

#### Scenario: Drill down on a phone
- **WHEN** a member opens Settings → Workspaces at 360 px and chooses Family
- **THEN** the list is replaced by Family's detail with a Back action, and Back returns to the list with Family focused

#### Scenario: Edit a group
- **WHEN** an admin opens the group "Adults" in Family, renames it to "Grown-ups" and adds Dan through the member picker
- **THEN** the group is renamed, Dan is listed among its members with Remove, and the list row shows the new name and one more avatar

#### Scenario: Deleting a group asks first
- **WHEN** the owner chooses Delete on "Adults", which is shared on House and Trip
- **THEN** a confirmation names House and Trip as losing access through the group, and the group is deleted only after it is confirmed

#### Scenario: Invite an admin for a day
- **WHEN** the owner creates an invite link with the role Admin and the expiry 1 day
- **THEN** the link is created with role `admin` and an expiry 24 hours ahead, and the pending list shows it as an admin link with its expiry date

#### Scenario: An admin invites members only
- **WHEN** an admin opens the Invites tab
- **THEN** the role choice offers Member only
