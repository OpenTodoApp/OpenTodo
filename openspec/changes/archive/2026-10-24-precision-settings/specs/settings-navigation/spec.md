## MODIFIED Requirements

### Requirement: Settings overview
There SHALL be no separate overview page. Below 1024 px wide the section list (profile card, search field, grouped sections with icon, name and one-line description, the free-software footer) SHALL be the whole screen, where each entry is a link at least 44 px tall that opens its section as a page. From 1024 px wide the list SHALL be a navigation pane of 228 px beside the page, separated from it by a hairline: the search field showing its `/` key, the group labels, and one 30 px row per section with its icon and name, the current one on the selected surface; the pane SHALL NOT repeat the profile card, the descriptions or the footer. Pressing `/` on a Settings page outside a text field SHALL focus the search field.

#### Scenario: Phone overview
- **WHEN** a member opens `/settings` on a 390 px wide screen
- **THEN** they see the profile card, the search field, the groups You, App and Data with their sections as tappable rows, no Server group, and the footer line

#### Scenario: Opening a section
- **WHEN** the user activates the Capture entry
- **THEN** the address becomes `/settings/capture` and the Capture section is shown

#### Scenario: Desktop list
- **WHEN** the owner opens `/settings` on a 1280 px wide screen
- **THEN** the list is the left column, the Account section is open beside it, and the address is `/settings/account`

#### Scenario: Navigation pane
- **WHEN** a user opens `/settings/notifications` on a 1440 px wide screen
- **THEN** the pane beside the page is 228 px wide with a hairline on its right, shows the search field with a `/` key, the group labels and one row per section with icon and name, marks Notifications on the selected surface, and shows no profile card, section descriptions or footer

#### Scenario: Slash focuses search
- **WHEN** a keyboard user on `/settings/general` presses `/` while no text field has focus
- **THEN** focus moves to the settings search field and no character is typed

### Requirement: Section page layout
A section page SHALL use the compact page header. From 1024 px wide the header SHALL show a breadcrumb, a "Settings" link then the section's name as the page heading, with the sidebar toggle first and Help at the right; under it the navigation pane SHALL sit beside the page with the current section marked `aria-current="page"`, and the page SHALL start with the section's name as a 22 px title and its one-line description as the lead line, followed by its sections with their own headings. The layout SHALL be the same for every section. Below 1024 px the page header SHALL carry a back action to the list. On navigation, focus SHALL move to the section heading. Every control SHALL stay reachable by keyboard.

#### Scenario: Desktop section
- **WHEN** a user opens `/settings/general` on a 1200 px wide screen
- **THEN** the grouped section list is shown beside the General sections with group headings, an icon per section, and General marked as the current page

#### Scenario: Phone section
- **WHEN** a user opens `/settings/data` on a 390 px wide screen
- **THEN** the page header has a back action to the list and no section list is shown beside the content

#### Scenario: Focus after navigation
- **WHEN** a keyboard user activates the Notifications entry
- **THEN** focus is on the "Notifications" heading of the new page

#### Scenario: Breadcrumb and title
- **WHEN** a user opens `/settings/notifications` on a 1440 px wide screen
- **THEN** the header reads "Settings › Notifications" after the sidebar toggle with Help at its right, "Settings" opens the list's first section, and the page starts with the 22 px title "Notifications" and the line saying what the section holds

### Requirement: Panel cards and rows
Each Settings section SHALL appear as a flat section with the fixed anatomy of the design system: heading, one line of description, rows. Individual settings SHALL be rows with label and description on one side and the control on the other, divided by hairlines, state shown as a status dot with its word beside the label. A section's or row's description SHALL be one sentence of at most 90 characters in English (the "Settings copy" requirement); a section whose guide section says more SHALL end its line with a "Learn more" link that opens contextual help at the section's screen id beside the page, without a reload and without losing what the user entered. Below 640 px each row SHALL stack the control under its label. No row or section SHALL scroll sideways at 320 px wide. Native select controls SHALL be styled as the design-system select, and controls in a row SHALL use the small control size.

#### Scenario: Wide row layout
- **WHEN** a user opens `/settings/general` on a 1200 px wide screen
- **THEN** the start view setting shows its label and description on the left and its control on the right, between hairlines, inside the General page, separated from neighbouring sections by visible space

#### Scenario: Narrow row layout
- **WHEN** the same section is opened on a 320 px wide screen
- **THEN** every control sits below its label and the page has no horizontal scroll

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

### Requirement: Card icons
A Settings section SHALL NOT draw an icon before its heading on the page. Every section of the You, App and Data groups SHALL still have one icon from the app's icon set, chosen once in the section table (for example: How you work, a compass; Session, a monitor; Password, a key; Two-factor authentication, a shield; Passkeys, a fingerprint; End-to-end encryption, a lock; Recent activity, a history clock), shown in the muted text colour before the section's name in Settings search results and hidden from assistive technology; the name alone names the result.

#### Scenario: Account cards
- **WHEN** the user opens Settings → Account
- **THEN** How you work, Session, Password, Two-factor authentication, Passkeys, End-to-end encryption and Recent activity show their headings without an icon, and a screen reader reads only the titles

#### Scenario: Search shows the same icon
- **WHEN** the user searches Settings for "passkey"
- **THEN** the result for the Passkeys card shows the fingerprint icon from the section table

### Requirement: Card tiers
Each Settings page SHALL be one flat page: no section SHALL be drawn as a card surface (raised fill, card radius, elevation or border). Every section SHALL be drawn flat: heading, line and rows on the page surface, its rows divided by hairlines, separated from the next section by vertical space. The anatomy of a section (heading, one line, rows, Learn more) and of a row SHALL be the same on every page, and the settings anatomy test SHALL check it.

#### Scenario: Account page tiers
- **WHEN** a user opens `/settings/account` on a 1200 px wide screen in light and in dark
- **THEN** the session, profile, password, passkeys and linked accounts sections are all flat on the page surface with hairlines between their rows, and every row keeps its label, line, state and control as before

#### Scenario: Phone tiers
- **WHEN** the same page is opened on a 390 px wide screen
- **THEN** the sections stack in the same order, controls sit under their labels, and the page has no horizontal scroll

#### Scenario: Anatomy unchanged
- **WHEN** the settings anatomy test runs over every panel
- **THEN** each section has one heading, one line of at most 90 characters, rows with label and control, and at most one Learn more link

#### Scenario: Only one primary card
- **WHEN** a change draws a section on the Server page with the card surface
- **THEN** the settings anatomy test fails naming the page and the section
