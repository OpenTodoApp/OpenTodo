## MODIFIED Requirements

### Requirement: Project and token commands
`ot project list|add|rename|archive|rm` SHALL manage projects and `ot token list|create|revoke` SHALL manage API tokens of the signed-in account, with the same output conventions as task commands. `ot token create <name> [--scope full|read|agent]` SHALL default to `full`, print the secret exactly once, and `ot token list` SHALL show each scope. `ot export` SHALL write the server's JSON export to stdout or `--out <file>`.

#### Scenario: Create a project
- **WHEN** the user runs `ot project add "Garden"`
- **THEN** the project exists on the server and appears in the web app's sidebar after its next sync

#### Scenario: Token secret shown once
- **WHEN** the user runs `ot token create backup-script`
- **THEN** the secret is printed with a notice that it will not be shown again and the token has scope `full`

#### Scenario: Agent token from the CLI
- **WHEN** the user runs `ot token create desk-assistant --scope agent`
- **THEN** the token is created with scope `agent` and the notice says that it can make changes only while both assistant switches are on

#### Scenario: Invalid scope rejected locally
- **WHEN** the user runs `ot token create x --scope admin`
- **THEN** the command exits with code 2 before any request is sent and lists the allowed scopes
