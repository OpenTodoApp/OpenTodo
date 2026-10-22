## MODIFIED Requirements

### Requirement: Connection editor
Adding or editing a connection SHALL take the provider, host, token (a password field, never prefilled; "Replace token" when editing), filter, target project through the project picker, label mapping and interval, and SHALL show the server's validation error beside the field it names. Because connections live on the server, the panel SHALL show the last loaded state while offline and disable actions until the connection returns. The editor SHALL present these fields in three numbered steps on one screen, each with a short heading: 1. "Where" (provider as two choices, GitHub or GitLab, and the host, prefilled for the public service and editable only for GitLab), 2. "Access" (the token with a one-line note on the scopes it needs and a link to create one at the provider), 3. "Which issues and where they go" (the target project, then the filter). Label mapping and the polling interval SHALL be behind "More options", closed by default and open when either differs from its default. Fields SHALL be stacked one per line with their help text under them, the dialog SHALL be at most 36 rem wide, and its actions (Test, Save) SHALL stay visible at the bottom while the steps scroll.

#### Scenario: Token field empty on edit
- **WHEN** a user opens Edit on a connection
- **THEN** the token field is empty and labelled "Replace token", and saving without typing one keeps the stored token

#### Scenario: Validation error shown in place
- **WHEN** the server answers `invalid_input` naming `host`
- **THEN** the dialog stays open with the message beside the host field

#### Scenario: Offline
- **WHEN** the panel is opened without a connection to the server
- **THEN** the previously loaded cards are visible, actions are disabled and the panel says a connection is required

#### Scenario: Short form by default
- **WHEN** a user opens "Connect GitHub"
- **THEN** the editor shows the three steps with GitHub chosen and `github.com` filled in, the token and project fields, and "More options" closed, with Test and Save visible without scrolling at 1280×800
