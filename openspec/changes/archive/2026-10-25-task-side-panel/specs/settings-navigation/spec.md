## MODIFIED Requirements

### Requirement: Settings sub-pages
A section whose content runs long SHALL be an overview of sub-pages, each at `/settings/<section>/<page>`: Account (Profile, Security, Recent activity, End-to-end encryption), Appearance (Theme and density, Sidebar, Task details), General (Start view and briefing, Keyboard, Focus timer, Maps), Language and region (Language, Date and time, Calendar grid), Notifications (Push notifications, Delivery channels, Weekly digest), Capture (Quick add, Voice capture, Bookmarklet and extension, Email to task), Integrations (Calendar apps (CalDAV), Calendar feeds, Issues, Webhooks, API tokens, Assistant, AI assistants (MCP)), People (Users and invitations, Access policies, Single sign-on) and Server (Backups, Attachments, Outgoing email, Branding, Maps, Automations, Speech to text, Audit log; on a hosted service Download your data, Branding, Maps, Automations and Audit log). The overview SHALL list one row per sub-page the viewer may see, at least 44 px tall, with its icon, its name and, where the server or the device can say it, its state in a word or a number ("On", "Off", "2", "None", "Two-factor off"), as flat rows between hairlines inside a navigation landmark named after the section. States SHALL load together when the overview opens and SHALL be left out offline or when the server refuses them. A section of which the viewer sees only one sub-page SHALL be that page, without an overview. An unknown or hidden sub-page id SHALL open the section's overview and replace the address. Sub-pages are client screens and open offline like sections.

#### Scenario: Integrations overview
- **WHEN** the owner with two webhooks and calendar feeds off opens `/settings/integrations`
- **THEN** the page lists Calendar apps (CalDAV), Calendar feeds, Issues, Webhooks, API tokens, Assistant and AI assistants (MCP), the Webhooks row reads "2" and the Calendar feeds row reads "Off", and no card of those pages is on the overview

#### Scenario: Opening a sub-page
- **WHEN** the user activates the Webhooks row
- **THEN** the address becomes `/settings/integrations/webhooks` and the page shows the Webhooks card with "Webhooks" as its heading

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
