## MODIFIED Requirements

### Requirement: Settings overview
There SHALL be no separate overview page. Below 1024 px wide the section list (profile card, search field, grouped sections with icon, name and one-line description, the free-software footer) SHALL be the whole screen, where each entry is a link at least 44 px tall that opens its section as a page, and that list SHALL NOT show a section's sub-pages. From 1024 px wide the list SHALL be a navigation pane of 228 px beside the page, separated from it by a hairline: the search field showing its `/` key, the group labels, and one 30 px row per section with its icon and name, the current one on the selected surface; the pane SHALL NOT repeat the profile card, the descriptions or the footer. From 1024 px, when the open section has more than one sub-page this viewer may see, those sub-pages SHALL be listed directly under that section as further 30 px rows, indented, each with its icon and its name, linking to `/settings/<section>/<page>`. The section row SHALL still open the section's overview. A section with no sub-pages, and a section this viewer sees as a single page, SHALL list no rows under it. A name that does not fit its row SHALL be truncated visually and the row's accessible name SHALL be the full name. The pane SHALL keep scrolling inside itself. Pressing `/` on a Settings page outside a text field SHALL focus the search field.

#### Scenario: Phone overview
- **WHEN** a member opens `/settings` on a 390 px wide screen
- **THEN** they see the profile card, the search field, the groups You, App and Data with their sections as tappable rows, no Server group, no sub-pages under any section, and the footer line

#### Scenario: Opening a section
- **WHEN** the user activates the Capture entry
- **THEN** the address becomes `/settings/capture` and the Capture section is shown

#### Scenario: Desktop list
- **WHEN** the owner opens `/settings` on a 1280 px wide screen
- **THEN** the list is the left column, the Account section is open beside it, Profile, Security, Recent activity, Invitations and End-to-end encryption are listed under Account, and the address is `/settings/account`

#### Scenario: Navigation pane
- **WHEN** a user opens `/settings/notifications` on a 1440 px wide screen
- **THEN** the pane beside the page is 228 px wide with a hairline on its right, shows the search field with a `/` key, the group labels and one row per section with icon and name, lists Reminders, Push notifications, Delivery channels and Weekly digest under Notifications, marks Notifications on the selected surface, and shows no profile card, section descriptions or footer

#### Scenario: A section without sub-pages
- **WHEN** the owner opens `/settings/workspaces` on a 1280 px wide screen
- **THEN** the pane lists Workspaces as a single row with nothing nested under it

#### Scenario: One visible page
- **WHEN** an admin opens `/settings/people` on a 1280 px wide screen
- **THEN** the pane lists People as a single row with nothing nested under it, and the page is the users list itself

#### Scenario: Slash focuses search
- **WHEN** a keyboard user on `/settings/general` presses `/` while no text field has focus
- **THEN** focus moves to the settings search field and no character is typed

### Requirement: Settings sub-pages
A section whose content runs long SHALL be an overview of sub-pages, each at `/settings/<section>/<page>`: Account (Profile, Security, Recent activity, End-to-end encryption), Appearance (Theme and density, Sidebar, Task details), General (Start view and briefing, Keyboard, Focus timer, Maps), Language and region (Language, Date and time, Calendar grid), Notifications (Reminders, Push notifications, Delivery channels, Weekly digest), Capture (Quick add, Voice capture, Bookmarklet and extension, Email to task), Integrations (Calendar apps (CalDAV), Calendar feeds, Issues, Webhooks, API tokens, Assistant, AI assistants (MCP)), People (Users and invitations, Access policies, Single sign-on) and Server (Backups, Attachments, Outgoing email, Branding, Maps, Automations, Speech to text, Audit log; on a hosted service Download your data, Branding, Maps, Automations and Audit log). The overview SHALL list one row per sub-page the viewer may see, at least 44 px tall, with its icon, its name and, where the server or the device can say it, its state in a word or a number ("On", "Off", "2", "None", "Two-factor off"), as flat rows between hairlines inside a navigation landmark named after the section. A state that the sub-page shows in the warning or danger tone SHALL be shown in the same tone on the overview row. States SHALL load together when the overview opens and SHALL be left out offline or when the server refuses them. A section of which the viewer sees only one sub-page SHALL be that page, without an overview. An unknown or hidden sub-page id SHALL open the section's overview and replace the address. Sub-pages are client screens and open offline like sections.

#### Scenario: Integrations overview
- **WHEN** the owner with two webhooks and calendar feeds off opens `/settings/integrations`
- **THEN** the page lists Calendar apps (CalDAV), Calendar feeds, Issues, Webhooks, API tokens, Assistant and AI assistants (MCP), the Webhooks row reads "2" and the Calendar feeds row reads "Off", and no card of those pages is on the overview

#### Scenario: Opening a sub-page
- **WHEN** the user activates the Webhooks row
- **THEN** the address becomes `/settings/integrations/webhooks` and the page shows the Webhooks settings with "Webhooks" as its title

#### Scenario: Overview offline
- **WHEN** a user opens `/settings/integrations` without a network connection
- **THEN** every row is listed and opens its page, and no row shows a state

#### Scenario: Admin's People
- **WHEN** an admin opens `/settings/people`
- **THEN** the users and members are shown on the People page itself, with no overview, and `/settings/people/access-policies` opens the same page

#### Scenario: Unknown sub-page
- **WHEN** a user opens `/settings/integrations/nonsense`
- **THEN** the Integrations overview is shown and the address becomes `/settings/integrations`

#### Scenario: Appearance pages
- **WHEN** a user opens `/settings/appearance`
- **THEN** the page lists Theme and density, Sidebar and Task details, and Task details opens `/settings/appearance/task-details` with the "Open tasks" row

#### Scenario: Warning on the overview
- **WHEN** the owner of a server where no backup has run and outgoing email is not configured opens `/settings/server`
- **THEN** the Backups and Outgoing email rows show their state with a warning dot, and the other rows keep the neutral style
