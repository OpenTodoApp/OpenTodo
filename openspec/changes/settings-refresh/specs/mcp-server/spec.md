## MODIFIED Requirements

### Requirement: Settings screen for assistants
The AI assistants section SHALL let the owner switch the endpoint and assistant writes on or off, and let every user see the endpoint URL, switch "Allow AI assistants to make changes" for their own account, and create a `read` token (preselected) or, when writes are allowed, an `agent` token, each shown once. It SHALL work with the keyboard and show the last fetched state offline with actions disabled. Connecting an assistant SHALL be presented as three numbered steps inside the card: 1. "Endpoint", the URL in a monospace field with Copy; 2. "Token", a choice between "Read only" (preselected) and, when writes are allowed, "Can make changes", each with one line saying what the assistant may do, and a "Create token" button that shows the token once in a monospace box with Copy; 3. "Add it to your assistant", instructions in tabs per client (Claude Desktop, Claude Code, other MCP clients) with a configuration snippet that already holds the endpoint and, right after creation, the token. The owner's switches SHALL be a separate group above the steps, and a user who cannot connect yet SHALL see one sentence saying why instead of the steps.

#### Scenario: Create a read token for an assistant
- **WHEN** a user creates a token from the AI assistants section without choosing otherwise
- **THEN** the token is created with scope `read`, shown once with a copy action, and appears in the token list labelled read-only

#### Scenario: Member sees status only
- **WHEN** a member opens the section while the owner has not enabled MCP
- **THEN** the section explains that the owner has not enabled it and offers no toggle

#### Scenario: Agent token offered only when writes are allowed
- **WHEN** the owner has allowed assistant writes and the user has switched on "Allow AI assistants to make changes"
- **THEN** the section offers "Create a token for an assistant that can make changes", which creates an `agent` token labelled "assistant, can make changes"

#### Scenario: Offline
- **WHEN** the device is offline and the user opens the section
- **THEN** the switches show their last fetched state and every action is disabled with a note that a connection is needed

#### Scenario: Three steps
- **WHEN** a user whose owner has enabled MCP opens the AI assistants card
- **THEN** it shows Endpoint with Copy, Token with Read only preselected and Create token, and the client tabs, in that order, numbered 1 to 3
