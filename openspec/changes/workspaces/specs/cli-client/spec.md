## MODIFIED Requirements

### Requirement: Configuration file and profiles
The client SHALL read a configuration file from the platform's user configuration directory containing one or more named profiles, each with a server URL, a token, an optional default output format and an optional default workspace (a name or id). The profile SHALL be chosen with `--profile`, falling back to a `default` profile. `OPENTODO_URL` and `OPENTODO_TOKEN` SHALL override the selected profile, and `--workspace <name or id>` (or `OPENTODO_WORKSPACE`) SHALL override the profile's workspace for one command. Without any of them, commands act on the account's default workspace. The file SHALL be created with owner-only permissions and the token SHALL never be printed by any command.

#### Scenario: Environment overrides the file
- **WHEN** the config file names server A and `OPENTODO_URL` and `OPENTODO_TOKEN` point to server B
- **THEN** the command runs against server B

#### Scenario: No configuration
- **WHEN** no profile exists and no environment variables are set
- **THEN** the command exits with code 2 and a message explaining how to run `ot login` or set the variables

#### Scenario: Permissions
- **WHEN** `ot login` writes the configuration file on a POSIX system
- **THEN** the file mode is 0600 and the directory mode is 0700

#### Scenario: Workspace for one command
- **WHEN** the profile's workspace is "Personal" and the user runs `ot add "Call the client" --workspace Work`
- **THEN** the task is created in Work's Inbox, and `ot list --workspace Work` lists it while `ot list` does not

#### Scenario: Unknown workspace
- **WHEN** `--workspace` names a workspace the account does not belong to
- **THEN** the command exits with code 2 and a message listing the available workspaces (`ot workspaces` prints the same list, with `--json`)
