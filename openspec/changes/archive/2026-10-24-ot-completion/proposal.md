# Shell completion for ot

## Why

`ot` has about fifty commands and subcommands and many flags, and people type project and label names into them all day. Without completion they reach for `ot help` or `ot schema`. ROADMAP.md "Future ideas" lists it: "Shell completion for `ot` (`ot schema` already describes every command and flag)".

## What Changes

- New command `ot completion bash|zsh|fish` prints a completion script for that shell.
- The script is a small wrapper that asks the binary itself, through a hidden `ot __complete -- <words…>`, what can follow the words typed so far. Commands, subcommands, aliases, flags and enum values come from the same command table that `ot help` and `ot schema` print, so completion cannot drift from the binary it runs against.
- Dynamic values, read from the active profile's server within 2 seconds: project names (`--project`, project refs, and `#Name` in an `ot add` title), label names (`--label`, `@name` in an `ot add` title), workspace names (`--workspace`), and task ids with their titles (`ot done`, `edit`, `rm`, `reopen`, `time start`, `time log`, `--task`, `--blocked-by`). Profile names come from the local config file. Files and directories are left to the shell (`--out`, `--passphrase-file`, vault folders).
- Offline, signed out, slow or failing servers produce no candidates and no output on stderr: completion never prints into the prompt.
- Names with spaces and shell metacharacters are quoted the way each shell expects.
- Install instructions in `docs/cli.md`; `ot help` mentions the command.

No new dependency, no new environment variable, no server change, no op-log change.

## Out of scope

- PowerShell completion.
- A local cache of names (decided against in design.md).
- Shipping pre-generated completion files in the release assets: the release ships bare `ot` binaries, not archives, and `ot completion <shell>` produces the script from the binary at hand.
- Completing saved views: the CLI has no saved-view command and the REST API no saved-view route.
- `--flag=value` completion in bash (zsh and fish complete it).
- Decrypting names of end-to-end encrypted accounts; encrypted values are left out.

Advances the ROADMAP "Future ideas" item **Shell completion** (`ot-completion`).
