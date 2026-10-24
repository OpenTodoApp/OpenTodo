## ADDED Requirements

### Requirement: Shell completion
`ot completion bash|zsh|fish` SHALL print a completion script for that shell. The script SHALL obtain candidates from the binary itself, so commands, subcommands, aliases, flags and enum values come from the same command table as `ot help` and `ot schema`. Values SHALL be completed where they are known: profile names from the configuration file; project, label and workspace names and open task ids (with their titles as descriptions) from the active profile's server within 2 seconds; `#project` and `@label` words in an `ot add` title. Completion SHALL never write to stderr or into the prompt: without a profile, a token or a reachable server it offers no values and still completes commands and flags. Names containing spaces or shell metacharacters SHALL be inserted correctly quoted. Encrypted values SHALL never be offered, and completion SHALL not store names on disk. Like every command it is an online client: values reflect only what devices have synced to the server.

#### Scenario: Commands and flags come from the command table
- **WHEN** a flag is added to a command's entry in the command table
- **THEN** completion offers it after that command, and a test fails if any command, subcommand or flag of `ot schema` cannot be completed

#### Scenario: Project names with spaces
- **WHEN** the account has a project "Big Project" and the user types `ot add Buy milk --project Bi` and presses Tab in bash
- **THEN** the word becomes `Big\ Project`, and zsh and fish insert it quoted as well

#### Scenario: Offline completion stays quiet
- **WHEN** the server cannot be reached and the user presses Tab after `ot list --project `
- **THEN** no candidates and no error text appear within about 2 seconds, and `ot list --proj` still completes to `--project`

#### Scenario: Scripts are valid
- **WHEN** `ot completion bash`, `ot completion zsh` and `ot completion fish` are run
- **THEN** each prints a script that its shell parses without error, and an unknown shell name exits 2
