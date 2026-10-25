## ADDED Requirements

### Requirement: Settings sub-pages
A section whose content runs long SHALL be an overview of sub-pages, each at `/settings/<section>/<page>`: Account (Profile, Security, Recent activity, End-to-end encryption), Appearance (Theme and density, Sidebar), General (Start view and briefing, Keyboard, Focus timer, Maps), Language and region (Language, Date and time, Calendar grid), Notifications (Push notifications, Delivery channels, Weekly digest), Capture (Quick add, Voice capture, Bookmarklet and extension, Email to task), Integrations (Calendar apps (CalDAV), Calendar feeds, Issues, Webhooks, API tokens, Assistant, AI assistants (MCP)), People (Users and invitations, Access policies, Single sign-on) and Server (Backups, Attachments, Outgoing email, Branding, Maps, Automations, Speech to text, Audit log; on a hosted service Download your data, Branding, Maps, Automations and Audit log). The overview SHALL list one row per sub-page the viewer may see, at least 44 px tall, with its icon, its name and, where the server or the device can say it, its state in a word or a number ("On", "Off", "2", "None", "Two-factor off"), as flat rows between hairlines inside a navigation landmark named after the section. States SHALL load together when the overview opens and SHALL be left out offline or when the server refuses them. A section of which the viewer sees only one sub-page SHALL be that page, without an overview. An unknown or hidden sub-page id SHALL open the section's overview and replace the address. Sub-pages are client screens and open offline like sections.

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

### Requirement: Sub-page navigation
From 1024 px a sub-page's header SHALL read as a breadcrumb "Settings › <section> › <page>", where the section links to its overview, and the navigation pane SHALL mark the section as the current item. Below 1024 px each level SHALL be its own page: the section list, the overview with a back action to the list, and the sub-page with a back action to its overview. Going back from a sub-page to its overview SHALL put focus on that sub-page's row; opening a sub-page SHALL put focus on its heading. The sub-page's Help link SHALL open the guide section of its main card.

#### Scenario: Breadcrumb on a wide screen
- **WHEN** a user opens `/settings/integrations/webhooks` on a 1280 px wide screen
- **THEN** the header reads "Settings › Integrations › Webhooks", "Integrations" opens `/settings/integrations`, the pane marks Integrations as current, and Help opens the webhooks guide section

#### Scenario: Back on a phone
- **WHEN** a user on a 390 px wide screen opens Capture, then Voice capture, then Back
- **THEN** the overview of Capture is shown with focus on its Voice capture row, and Back again shows the section list

### Requirement: Settings page length
No Settings page (a one-page section, an overview or a sub-page) SHALL be taller than about 1.5 screens at 1280×800 or at 390×844 for the owner of a server with every owner feature on, except pages whose length is a growing list of records (the audit log, recent activity) and single-feature set-up pages (the assistant and AI assistants for the owner). `scripts/ux-audit/settings-heights.mjs` SHALL measure every page at both sizes.

#### Scenario: Measuring
- **WHEN** a developer runs `node scripts/ux-audit/settings-heights.mjs` against a built server
- **THEN** it prints the height of every section, overview and sub-page it reaches by following the list and the overview rows, in pixels and in screens, at 1280×800 and 390×844, and marks those taller than 1.5 screens

## MODIFIED Requirements

### Requirement: Settings sections and routes
Settings SHALL be split into sections at `/settings/<id>`: `account`, `workspaces`, `appearance`, `general`, `language`, `notifications`, `capture`, `about`, `integrations`, `data`, `people` and `server`, and sections with sub-pages SHALL have them at `/settings/<id>/<page>`. `/settings` SHALL open the first visible section from 1024 px wide and the section list below it; `/settings/import` SHALL keep the import screen. An unknown section SHALL open the first visible section. Sections are client screens and open offline; rows that need the server show their offline state inside the section.

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

### Requirement: Section page layout
A section page SHALL use the compact page header. From 1024 px wide the header SHALL show a breadcrumb, a "Settings" link then the section's name as the page heading (on a sub-page, the section as a link then the page's name as the heading), with the sidebar toggle first and Help at the right; under it the navigation pane SHALL sit beside the page with the current section marked `aria-current="page"` (on a sub-page, `aria-current="true"`), and the page SHALL start with the section's name as a 22 px title and its one-line description as the lead line (on a sub-page, the page's name alone), followed by its sections with their own headings. The layout SHALL be the same for every section. Below 1024 px the page header SHALL carry a back action to the level above. On navigation, focus SHALL move to the section heading. Every control SHALL stay reachable by keyboard.

#### Scenario: Desktop section
- **WHEN** a user opens `/settings/data` on a 1200 px wide screen
- **THEN** the grouped section list is shown beside the Data sections with group headings, an icon per section, and Data marked as the current page

#### Scenario: Phone section
- **WHEN** a user opens `/settings/data` on a 390 px wide screen
- **THEN** the page header has a back action to the list and no section list is shown beside the content

#### Scenario: Focus after navigation
- **WHEN** a keyboard user activates the Notifications entry
- **THEN** focus is on the "Notifications" heading of the new page

#### Scenario: Breadcrumb and title
- **WHEN** a user opens `/settings/notifications` on a 1440 px wide screen
- **THEN** the header reads "Settings › Notifications" after the sidebar toggle with Help at its right, "Settings" opens the list's first section, and the page starts with the 22 px title "Notifications" and the line saying what the section holds

### Requirement: Outgoing email card on the Server page
The Outgoing email card SHALL be the Outgoing email page of Server, listed between Attachments and Branding, and its state (configured or not, the server and From address, the last test) SHALL read as a badge and text beside its row's label; the Server overview SHALL show "On" for it once it is configured.

#### Scenario: Owner sees outgoing email
- **WHEN** the owner opens `/settings/server`
- **THEN** the Outgoing email row is listed after Attachments and before Branding, the list describes Server as backups, attachments, outgoing email, branding, maps, automations, speech to text and the audit log, and searching Settings for "SMTP" or "outgoing email" opens `/settings/server/outgoing-email` at that card

### Requirement: Demo instance sections
On a demo instance every section and sub-page SHALL be listed and every row shown; rows the demo refuses SHALL have their controls disabled with one demo note at the top of the page naming them: on an overview, everything its pages refuse; on a sub-page, what that page refuses. The note SHALL be one line, "Demo instance: {features} are disabled here.", followed by a Learn more link that opens the demo part of the getting-started guide, which says that the sandbox is private, deleted after 2 hours of inactivity and every night, and that running your own server takes one container. No section or page SHALL be hidden or replaced by a note.

#### Scenario: Integrations on the demo
- **WHEN** a sandbox opens `/settings/integrations` and then `/settings/integrations/webhooks`
- **THEN** the overview starts with the demo note naming calendar apps, calendar feeds, webhooks, API tokens, the assistant and AI assistants, and the Webhooks page starts with a note naming webhooks, its card visible with disabled controls

#### Scenario: General on the demo
- **WHEN** a sandbox opens the pages of General and then `/settings/capture/browser`
- **THEN** start view, calendar and keyboard settings work as on any server, and the bookmarklet works without a note, while `/settings/capture/email` shows email to task disabled under the note

#### Scenario: Security on the demo
- **WHEN** a sandbox opens `/settings/account/security`
- **THEN** the page starts with the demo note naming password and two-factor authentication, passkeys and linked accounts, those rows are visible with disabled controls, and signing out of the device works

#### Scenario: Demo note is one line
- **WHEN** a sandbox opens `/settings/account` on a 1200 px wide screen
- **THEN** the note reads "Demo instance: password and two-factor authentication, passkeys, linked accounts and end-to-end encryption are disabled here. Learn more", the overview rows follow it at once, and Learn more opens the "Try the demo" section of the getting-started guide beside the page

### Requirement: Settings groups
The section list SHALL show sections in this order and in these groups. You: Account, Workspaces, Appearance. App: General, Language and region, Notifications, Capture, About. Data: Integrations, Data. Server: People, Server. Groups SHALL be labelled headings, a group with no visible section SHALL be omitted, and each group's list SHALL be exposed to assistive technology under its heading.

#### Scenario: Group headings for screen readers
- **WHEN** a screen reader user moves through the list
- **THEN** each group is announced by its heading before its section links, and the Server group is absent for a member

#### Scenario: Owner order
- **WHEN** the owner opens the list
- **THEN** the twelve sections appear in the four groups in the stated order

### Requirement: Account and General section contents
Account SHALL hold profile and how you work (Profile), the session, password, two-factor, passkeys and linked accounts (Security), recent activity, and encryption; General SHALL hold the start view and the briefing (one synced "Show the briefing" switch, the same preference as the day pages' Hide briefing, screen id `settings/briefing`), keyboard, Focus (the timer mode and lengths, auto-start, the break reminder and the sound of OpenSpec change `focus-mode`, screen id `settings/focus`) and maps; Language and region SHALL hold the language, date and time, and the calendar grid.

#### Scenario: Where a setting lives
- **WHEN** the user looks for passkeys and for the date and time format
- **THEN** passkeys are found on Account → Security and date and time on Language and region → Date and time

#### Scenario: Focus settings
- **WHEN** the user looks for the Pomodoro work length or the break reminder
- **THEN** both are found in the Focus card of General → Focus timer, and its Help link opens the focus guide

#### Scenario: Briefing switch
- **WHEN** the user searches settings for "briefing"
- **THEN** "Show the briefing" is listed under General, and its card says the choice applies on all the user's devices

### Requirement: Legacy settings addresses
Addresses of earlier layouts SHALL open the section or sub-page that now holds their content and replace the address without adding a history entry: `security` → `account/security`; `encryption` → `account/encryption`; `activity` → `account/activity`; `preferences` → `general`; `projects` → `data`; `ai` → `integrations/assistant`; `admin` → `people`; `access` → `people/access-policies`; `backups` → `server/backups`. An address with the anchor of an earlier page (`/settings/integrations#webhooks`, `/settings/general#date-time-heading`) SHALL open the page that now holds the anchor, scrolled to it. The ids kept (`account`, `general`, `notifications`, `capture`, `integrations`, `data`) SHALL keep opening the section of that id.

#### Scenario: Old General link
- **WHEN** a user opens a bookmark to `/settings/general`
- **THEN** the General overview is shown with the start view, keyboard, focus timer and maps rows, and the address stays `/settings/general`

#### Scenario: Old Account link
- **WHEN** a user opens `/settings/account`
- **THEN** the Account overview is shown with the profile, security, recent activity and encryption rows

#### Scenario: Old Security link
- **WHEN** a user opens a bookmark to `/settings/security`
- **THEN** Account → Security is shown, the address bar reads `/settings/account/security`, and pressing back leaves Settings

#### Scenario: Old Preferences link
- **WHEN** a user opens `/settings/preferences`
- **THEN** the General section is shown and the address reads `/settings/general`

#### Scenario: Old anchor
- **WHEN** a user opens `/settings/general#date-time-heading`
- **THEN** Language and region → Date and time is shown with the Date and time card focused, and the address reads `/settings/language/date-time`

### Requirement: Settings search
The settings list SHALL start with a search field that filters sections and individual rows by label and description as the user types, showing matching rows under their section name; Enter on a result opens the sub-page (or the section) that holds the row, scrolled to the row with the row focused and tinted for a moment (a colour change only, so it holds under reduced motion). The same index SHALL feed the command palette, so a setting is reachable by name from anywhere.

#### Scenario: Find a row
- **WHEN** the user types "week" in the settings search
- **THEN** "First day of the week" is listed under Language and region, and Enter opens Language and region → Date and time with that card focused and tinted

#### Scenario: From the palette
- **WHEN** the user types "passkey" in the command palette
- **THEN** "Account › Passkeys" is listed and opens Account → Security at the passkeys row
