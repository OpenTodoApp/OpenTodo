## MODIFIED Requirements

### Requirement: The instance's name and mark everywhere the app named itself
On a branded instance, the server and the app SHALL name the instance everywhere they name themselves:
- The served page SHALL carry the name as its title and the logo as favicon and touch icon.
- The web app manifest SHALL carry the name (and a short name of at most 12 characters) and the logo as its icons.
- `GET /api/v1/auth/status` SHALL carry `branding: {name, logoVersion}` for every visitor.
- The app SHALL show the logo in place of the brand mark and the name in place of the wordmark "OpenTodo" on the sign-in, invitation, reset and email screens, the share-capture screen and the sidebar's brand line.
- The app SHALL name the instance in the tab title.

The sidebar's header SHALL show the current workspace, not the instance. An unbranded instance SHALL be served and rendered exactly as before, apart from the sidebar, where the app's mark and name are in the brand line. The app SHALL remember the branding on the device so the first paint and offline use show it.

#### Scenario: Branded page and manifest
- **WHEN** a visitor loads `/` on an instance named "Acme Tasks" with a logo at version 2
- **THEN** the page's title is "Acme Tasks", its icon link is `/branding/logo-32.png?v=2`, its touch icon `/branding/logo-180.png?v=2`, and the manifest's `name` is "Acme Tasks" with `/branding/logo-512.png?v=2` among its icons and none of the app's own

#### Scenario: Name only
- **WHEN** the owner set a name and no logo
- **THEN** the title and the sidebar's brand line show the name, and the app's own icons and mark stay

#### Scenario: Unbranded
- **WHEN** no name and no logo are set
- **THEN** the page, the manifest and every screen other than the sidebar are unchanged, the sidebar's brand line shows the app's mark and "OpenTodo", and `auth/status` carries an empty name and `logoVersion` 0

#### Scenario: Tab title
- **WHEN** the user opens Today on an instance named "Acme Tasks"
- **THEN** the tab title is "Today – Acme Tasks"
