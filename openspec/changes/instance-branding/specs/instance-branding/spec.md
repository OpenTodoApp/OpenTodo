## ADDED Requirements

### Requirement: Owner sets a name and a logo
The owner SHALL be able to name the instance and give it a logo in Settings → Server → Branding, through `GET`/`PUT /api/v1/settings/branding` (`{name}`: at most 40 characters after trimming, no control characters, empty for the default) and `PUT`/`DELETE /api/v1/settings/branding/logo` (the raw bytes of a PNG or JPEG of at most 2 MB and at least 192 and at most 4096 pixels a side). Both SHALL require the owner, SHALL be refused on the demo instance, and SHALL be recorded as `settings.changed` (`branding.name`, `branding.logo`). Branding is server state, not synced, unavailable offline: the card then shows the last values read-only. Errors: `unauthorized`, `forbidden`, `invalid_input`, `too_large`.

#### Scenario: Name saved
- **WHEN** the owner saves the name "  Acme Tasks  "
- **THEN** the response carries `name: "Acme Tasks"`, the change is recorded, and the browser tab reads "Acme Tasks" on the next load

#### Scenario: Name refused
- **WHEN** the owner saves a name of 41 characters, or one with a control character
- **THEN** the response is 400 `invalid_input` and the name is unchanged

#### Scenario: Logo refused
- **WHEN** the upload is a 100×100 PNG, an SVG, or larger than 2 MB
- **THEN** the response is 400 `invalid_input` (413 `too_large` for the size) and the previous logo stays

#### Scenario: Member or anonymous caller
- **WHEN** a member or an anonymous request changes the branding
- **THEN** the response is 403 `forbidden` for the member and 401 `unauthorized` for the anonymous request

### Requirement: Logo rendered and served
From one upload the server SHALL crop the centre square and render PNGs of 32, 180, 192 and 512 pixels plus a maskable 512-pixel icon (the logo at 80 percent on the logo's edge colour, or the app's dark canvas when the edge is transparent) under `<data>/branding/`, SHALL bump a logo version that only grows (a new upload after a removal gets a new version), and SHALL serve them at `GET /branding/logo-<size>.png` to everyone, cached for a year when the request names the current version and `no-cache` otherwise. Without a logo the addresses SHALL answer 404.

#### Scenario: Every size
- **WHEN** the owner uploads a 600×400 PNG
- **THEN** `/branding/logo-32.png`, `-180`, `-192`, `-512` and `logo-maskable-512.png` answer 200 with square PNGs of those sizes, `?v=1` is `immutable`, and `logoVersion` is 1

#### Scenario: Removed and replaced
- **WHEN** the owner removes the logo and later uploads another
- **THEN** the addresses answer 404 in between, and the new logo has `logoVersion` 2, so no cached address shows the old image

### Requirement: The instance's name and mark everywhere the app named itself
On a branded instance the served page SHALL carry the name as its title and the logo as favicon and touch icon, the web app manifest SHALL carry the name (and a short name of at most 12 characters) and the logo as its icons, and `GET /api/v1/auth/status` SHALL carry `branding: {name, logoVersion}` for every visitor. The app SHALL show the logo in place of the brand mark and the name in place of the wordmark "OpenTodo" on the sign-in, invitation, reset and email screens, the share-capture screen, the sidebar rail and the workspace control, and SHALL name the instance in the tab title. An unbranded instance SHALL be served and rendered exactly as before. The app SHALL remember the branding on the device so the first paint and offline use show it.

#### Scenario: Branded page and manifest
- **WHEN** a visitor loads `/` on an instance named "Acme Tasks" with a logo at version 2
- **THEN** the page's title is "Acme Tasks", its icon link is `/branding/logo-32.png?v=2`, its touch icon `/branding/logo-180.png?v=2`, and the manifest's `name` is "Acme Tasks" with `/branding/logo-512.png?v=2` among its icons and none of the app's own

#### Scenario: Name only
- **WHEN** the owner set a name and no logo
- **THEN** the title and the wordmark show the name and the app's own icons and mark stay

#### Scenario: Unbranded
- **WHEN** no name and no logo are set
- **THEN** the page, the manifest and every screen are unchanged and `auth/status` carries an empty name and `logoVersion` 0

#### Scenario: Tab title
- **WHEN** the user opens Today on an instance named "Acme Tasks"
- **THEN** the tab title is "Today – Acme Tasks"

### Requirement: Powered by OpenTodo
On a branded instance the sign-in card's footer SHALL read "Powered by OpenTodo <version> · AGPL-3.0 · no tracking, no telemetry"; an unbranded instance keeps "OpenTodo <version> · AGPL-3.0 · no tracking, no telemetry". Settings → About SHALL be unchanged.

#### Scenario: Footer
- **WHEN** a visitor opens the sign-in screen of an instance with a logo
- **THEN** the footer starts with "Powered by OpenTodo"
