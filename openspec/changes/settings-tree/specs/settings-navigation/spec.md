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
- **THEN** the pane beside the page is 228 px wide with a hairline on its right, shows the search field with a `/` key, the group labels and one row per section with icon and name, lists Push notifications, Delivery channels and Weekly digest under Notifications, marks Notifications on the selected surface, and shows no profile card, section descriptions or footer

#### Scenario: A section without sub-pages
- **WHEN** the owner opens `/settings/workspaces` on a 1280 px wide screen
- **THEN** the pane lists Workspaces as a single row with nothing nested under it

#### Scenario: One visible page
- **WHEN** an admin opens `/settings/people` on a 1280 px wide screen
- **THEN** the pane lists People as a single row with nothing nested under it, and the page is the users list itself

#### Scenario: Slash focuses search
- **WHEN** a keyboard user on `/settings/general` presses `/` while no text field has focus
- **THEN** focus moves to the settings search field and no character is typed

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

### Requirement: Sub-page navigation
From 1024 px a sub-page's header SHALL read as a breadcrumb "Settings › <section> › <page>", where the section links to its overview, and the navigation pane SHALL mark that sub-page's row as the current page and the section row as the current section. Choosing a sub-page row SHALL open that sub-page. Choosing the section row SHALL open the overview, which keeps each sub-page's state in a word. Below 1024 px each level SHALL be its own page: the section list, the overview with a back action to the list, and the sub-page with a back action to its overview, and the section list SHALL NOT list sub-pages. Going back from a sub-page to its overview SHALL put focus on that sub-page's row; opening a sub-page SHALL put focus on its heading. The sub-page's Help link SHALL open the guide section of its main card.

#### Scenario: Breadcrumb on a wide screen
- **WHEN** a user opens `/settings/integrations/webhooks` on a 1280 px wide screen
- **THEN** the header reads "Settings › Integrations › Webhooks", "Integrations" opens `/settings/integrations`, the pane marks the Webhooks row as the current page and Integrations as the current section, and Help opens the webhooks guide section

#### Scenario: Between two sub-pages
- **WHEN** a user on `/settings/integrations/webhooks` at 1280 px wide activates API tokens in the pane
- **THEN** the address becomes `/settings/integrations/tokens` without opening the overview first, and focus is on the API tokens heading

#### Scenario: Back on a phone
- **WHEN** a user on a 390 px wide screen opens Capture, then Voice capture, then Back
- **THEN** the overview of Capture is shown with focus on its Voice capture row, and Back again shows the section list with no sub-pages listed
