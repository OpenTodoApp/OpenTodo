## MODIFIED Requirements

### Requirement: Section page layout
A section page SHALL use the compact page header. From 1024 px wide the header SHALL show a breadcrumb, a "Settings" link then the section's name as the page heading (on a sub-page, the section as a link then the page's name as the heading), with the sidebar toggle first and Help at the right; under it the navigation pane SHALL sit beside the page with the current section marked `aria-current="page"` when that section's overview is open and `aria-current="true"` when one of its sub-pages is open, and on a sub-page that sub-page's row SHALL be marked `aria-current="page"`. The page SHALL start with a page head: the section's or sub-page's name as a 22 px title (from 1024 px), then its lead line, which says in one sentence what the page is for, then its scope line when the page's settings do not apply to the viewer's account alone, then its status and primary action when it has them. The lead line and the scope line SHALL also be shown below 1024 px, where the title stays in the page header. The layout SHALL be the same for every section and sub-page. Below 1024 px the page header SHALL carry a back action to the level above. On navigation, focus SHALL move to the section heading. Every control SHALL stay reachable by keyboard.

#### Scenario: Desktop section
- **WHEN** a user opens `/settings/data` on a 1200 px wide screen
- **THEN** the grouped section list is shown beside the Data sections with group headings, an icon per section, and Data marked as the current page

#### Scenario: Phone section
- **WHEN** a user opens `/settings/data` on a 390 px wide screen
- **THEN** the page header has a back action to the list, no section list is shown beside the content, and the page starts with its lead line

#### Scenario: Focus after navigation
- **WHEN** a keyboard user activates the Notifications entry
- **THEN** focus is on the "Notifications" heading of the new page

#### Scenario: Breadcrumb and title
- **WHEN** a user opens `/settings/notifications` on a 1440 px wide screen
- **THEN** the header reads "Settings › Notifications" after the sidebar toggle with Help at its right, "Settings" opens the list's first section, and the page starts with the 22 px title "Notifications" and the line saying what the section holds

#### Scenario: Current sub-page in the pane
- **WHEN** a user opens `/settings/integrations/webhooks` on a 1280 px wide screen
- **THEN** the Webhooks row under Integrations is marked `aria-current="page"` and the Integrations row is marked `aria-current="true"`

#### Scenario: Sub-page lead line
- **WHEN** a user opens `/settings/integrations/webhooks` on a 1280 px wide screen
- **THEN** the title "Webhooks" is followed by one line saying that webhooks send a signed request to an address when tasks and projects change, and no section heading below repeats "Webhooks"

#### Scenario: Server scope
- **WHEN** the owner opens `/settings/server/outgoing-email` on a 1280 px or a 390 px wide screen
- **THEN** the page head says that the setting applies to everyone on this server, before any row

#### Scenario: Device scope
- **WHEN** a user opens `/settings/language/calendar`
- **THEN** the page head says that these settings apply to this device only

### Requirement: Panel cards and rows
Each Settings section SHALL appear as a flat section with the fixed anatomy of the design system: heading, one line of description, rows; a page with a single section SHALL show no heading for it. Individual settings SHALL be rows with label and description on one side and the control on the other, divided by hairlines, state shown as a status dot with its word beside the label. A state that keeps a feature from working or leaves people without a way back in (no backup has run, outgoing email not configured, two-factor off, a delivery failing) SHALL use the warning or danger tone; a feature simply switched off SHALL use the off tone. A section's or row's description SHALL be one sentence of at most 90 characters in English (the "Settings copy" requirement); a section whose guide section says more SHALL end its line with a "Learn more" link that opens contextual help at the section's screen id beside the page, without a reload and without losing what the user entered. Below 640 px each row SHALL stack its control under its label, except a row whose only control is a switch, which SHALL keep the switch at the end of the label's line. No row or section SHALL scroll sideways at 320 px wide. Native select controls SHALL be styled as the design-system select, and controls in a row SHALL use the small control size.

#### Scenario: Wide row layout
- **WHEN** a user opens `/settings/general` on a 1200 px wide screen
- **THEN** the start view setting shows its label and description on the left and its control on the right, between hairlines, inside the General page, separated from neighbouring sections by visible space

#### Scenario: Narrow row layout
- **WHEN** the same section is opened on a 320 px wide screen
- **THEN** every control other than a switch sits below its label and the page has no horizontal scroll

#### Scenario: Switch row on a phone
- **WHEN** a user opens `/settings/general/keyboard` on a 390 px wide screen
- **THEN** each switch sits at the end of its label's line, the description wraps under the label, and the switch keeps a 44 px touch target

#### Scenario: One line per card
- **WHEN** a user opens `/settings/account` on a 1200 px wide screen
- **THEN** the Two-factor authentication section reads "A six-digit code from an authenticator app after your password. Learn more" on one line under its heading, and the recovery-code and passkey explanations are in the guide section Learn more opens, not on the page

#### Scenario: Learn more keeps the page
- **WHEN** a user has typed a new webhook address in the Webhooks card and activates its Learn more link
- **THEN** the webhooks guide opens beside the section, the typed address is still in the field, and closing Help returns focus to the Learn more link

#### Scenario: Learn more offline
- **WHEN** the installed app is offline and the user activates Learn more on the Backups card
- **THEN** the guide section opens from the precached Help bundle

#### Scenario: State as a dot
- **WHEN** a user with push on for this device opens `/settings/notifications`
- **THEN** the push row shows a green dot and the word "On" beside its label, not a coloured pill

#### Scenario: Blocking state in the warning tone
- **WHEN** the owner of a server without outgoing email opens `/settings/server/outgoing-email`
- **THEN** the mail server row shows a warning dot with "Not configured", not the off tone

### Requirement: Card tiers
Each Settings page SHALL be one flat page: no section SHALL be drawn as a card surface (raised fill, card radius, elevation or border). Every section SHALL be drawn flat: heading, line and rows on the page surface, its rows divided by hairlines, separated from the next section by vertical space. A section heading SHALL outrank its rows: it SHALL be at least the size and weight of a row label and drawn in the strong text colour, never in the muted colour. A page with exactly one section SHALL show no heading for that section, and that section's line SHALL be the page's lead line; no page SHALL show a section heading that repeats the page's title. The anatomy of a section (heading, one line, rows, Learn more) and of a row SHALL be the same on every page, and the settings anatomy test SHALL check it.

#### Scenario: Account page tiers
- **WHEN** a user opens `/settings/account` on a 1200 px wide screen in light and in dark
- **THEN** the session, profile, password, passkeys and linked accounts sections are all flat on the page surface with hairlines between their rows, and every row keeps its label, line, state and control as before

#### Scenario: Phone tiers
- **WHEN** the same page is opened on a 390 px wide screen
- **THEN** the sections stack in the same order, controls other than switches sit under their labels, and the page has no horizontal scroll

#### Scenario: Anatomy unchanged
- **WHEN** the settings anatomy test runs over every panel
- **THEN** each section has one heading, one line of at most 90 characters, rows with label and control, and at most one Learn more link

#### Scenario: Only one primary card
- **WHEN** a change draws a section on the Server page with the card surface
- **THEN** the settings anatomy test fails naming the page and the section

#### Scenario: One-section page
- **WHEN** a user opens `/settings/server/backups`, whose page has the backups section and the restore section, and then `/settings/capture/voice`, whose page has one section
- **THEN** Backups shows both section headings above their rows in the strong colour, and Voice capture shows its title, its lead line and its row with no section heading

#### Scenario: Duplicate title fails the test
- **WHEN** a page shows a section heading equal to its own title
- **THEN** the settings anatomy test fails naming the page

### Requirement: Settings sub-pages
A section whose content runs long SHALL be an overview of sub-pages, each at `/settings/<section>/<page>`: Account (Profile, Security, Recent activity, End-to-end encryption), Appearance (Theme and density, Sidebar, Task details), General (Start view and briefing, Keyboard, Focus timer, Maps), Language and region (Language, Date and time, Calendar grid), Notifications (Push notifications, Delivery channels, Weekly digest), Capture (Quick add, Voice capture, Bookmarklet and extension, Email to task), Integrations (Calendar apps (CalDAV), Calendar feeds, Issues, Webhooks, API tokens, Assistant, AI assistants (MCP)), People (Users and invitations, Access policies, Single sign-on) and Server (Backups, Attachments, Outgoing email, Branding, Maps, Automations, Speech to text, Audit log; on a hosted service Download your data, Branding, Maps, Automations and Audit log). The overview SHALL list one row per sub-page the viewer may see, at least 44 px tall, with its icon, its name and, where the server or the device can say it, its state in a word or a number ("On", "Off", "2", "None", "Two-factor off"), as flat rows between hairlines inside a navigation landmark named after the section. A state that the sub-page shows in the warning or danger tone SHALL be shown in the same tone on the overview row. States SHALL load together when the overview opens and SHALL be left out offline or when the server refuses them. A section of which the viewer sees only one sub-page SHALL be that page, without an overview. An unknown or hidden sub-page id SHALL open the section's overview and replace the address. Sub-pages are client screens and open offline like sections.

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

## ADDED Requirements

### Requirement: Settings save behaviour
Every Settings control SHALL follow one save rule. A single control (a switch, a select, a segmented control, a radio group) SHALL save when its value changes, with no Save button, and SHALL show the saved value in place. A form of several fields that belong together (for example the outgoing email server, single sign-on, attachment limits, the focus timer's lengths, a workspace's name and colour) SHALL show a save bar while it has unsaved changes, holding Save and Discard; the bar SHALL NOT be shown when nothing has changed. Leaving a page or closing a form with unsaved changes SHALL ask whether to discard them. A save that fails SHALL put back the last saved value, keep a form's draft, and say what went wrong next to the control or in the save bar. Settings are server or device state, not ops: a save that needs the server SHALL be disabled offline with the panel's offline note, and a device setting SHALL save offline.

#### Scenario: A switch saves at once
- **WHEN** the owner turns on Allow attachments on `/settings/server/attachments`
- **THEN** the setting is saved without pressing a button, and the switch shows On after the server confirms

#### Scenario: Save bar on a form
- **WHEN** the owner changes the maximum file size on the same page
- **THEN** a save bar with Save and Discard appears, Discard restores the saved size and hides the bar, and Save stores the size and hides the bar

#### Scenario: Leaving with unsaved changes
- **WHEN** the owner has edited the outgoing email host without saving and opens another settings page
- **THEN** a dialog asks whether to discard the change, and Cancel keeps the page and the draft

#### Scenario: Failed save
- **WHEN** a switch's save is refused by the server
- **THEN** the switch returns to its previous position and a message next to it says why

#### Scenario: Offline
- **WHEN** a user opens Attachments offline
- **THEN** the switch and the fields are disabled with the offline note, while a device setting such as the calendar grid hours still saves
