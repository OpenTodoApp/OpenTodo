## ADDED Requirements

### Requirement: Objective commands
The CLI SHALL offer these commands, each calling the objectives routes (OpenSpec `plan-objectives`):
- `ot objectives`: by default the current quarter's and current week's objectives, Monday weeks; filtered with `--quarter`, `--week` or `--period <p>`; `--json` for JSON output;
- `ot objectives add "<title>" --quarter|--week [--next]`;
- `ot objectives done`, `undone`, `edit --title` and `delete` with an `<id>`.

The commands SHALL honour `--dry-run`, read-only mode and the JSON exit codes like every other command, and `ot schema` SHALL describe them. An encrypted title the CLI cannot decrypt SHALL print as `[encrypted]`. A refused limit SHALL exit non-zero with the server's message.

#### Scenario: Add next week's objective
- **WHEN** the user runs `ot objectives add "Draft the talk" --week --next` on 2026-10-28
- **THEN** an objective with the period `2026-W45` is created, and `ot objectives --period 2026-W45` lists it

#### Scenario: Limit reached
- **WHEN** the current week already has five open objectives and the user runs `ot objectives add "One more" --week`
- **THEN** the command exits non-zero with the message for `too_many_objectives`, and nothing is created
