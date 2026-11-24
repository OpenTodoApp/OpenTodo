## ADDED Requirements

### Requirement: Subtasks in the CLI
`ot add` SHALL accept `--parent <ref>`, a task ref (full id or unique id prefix of a live task), and create the task as a subtask of it. Without `--project`, the task SHALL take the parent's project, or the parent's workspace when the parent has no project. A completed parent, or a `--project` that differs from the parent's project, SHALL exit with the usage error code and send nothing.

`ot edit` SHALL accept `--parent <ref>` to make a task a subtask of another task and `--parent none` to bring it back to the top level. When the parent is in another project, the same patch SHALL move the task to that project. A parent the server refuses (deleted, the task itself or one of its descendants) SHALL exit with the server's error and leave the task unchanged.

`ot list` SHALL accept `--parent <ref>` and list only the direct subtasks of that task, in position order, combined with the other list flags.

The writes go through the REST API, so they apply and converge like any other client write. `ot` is online-only, so an unreachable server changes nothing.

#### Scenario: Add a subtask
- **WHEN** the user runs `ot add "Book hotel" --parent 3f2a` and `3f2a` is the open task "Plan trip" in Travel
- **THEN** "Book hotel" is created in Travel with `parent_id` set to "Plan trip"'s id

#### Scenario: Project contradicts the parent
- **WHEN** the user runs `ot add "Book hotel" --parent 3f2a --project Work` and "Plan trip" is in Travel
- **THEN** the command exits with the usage error code and no request is sent

#### Scenario: Move back to the top level
- **WHEN** the user runs `ot edit <hotel-id> --parent none`
- **THEN** "Book hotel" has no parent and is listed at the top level of Travel

#### Scenario: Cycle refused
- **WHEN** the user runs `ot edit 3f2a --parent <hotel-id>` while "Book hotel" is a subtask of "Plan trip"
- **THEN** the command exits with the server's `invalid_input` error and "Plan trip" keeps no parent

#### Scenario: List the subtasks of a task
- **WHEN** the user runs `ot list --parent 3f2a --json`
- **THEN** the output holds the open direct subtasks of "Plan trip" and nothing else

### Requirement: Subtask cascades in the CLI
`ot done`, `ot rm` and `ot edit` SHALL accept `--subtasks`. With it, `ot done` SHALL also complete every open descendant of each task, and `ot rm` SHALL also delete every live descendant. `ot edit` SHALL give every live descendant the task's new project when the edit changes the project. Each descendant SHALL be written with its own request, before the task itself for `done` and `rm` and after it for `edit`. Every write SHALL be listed by `--dry-run`. Without `--subtasks`, the commands SHALL change only the tasks named, as before. `ot rm --subtasks` SHALL ask for confirmation listing every task it deletes.

#### Scenario: Complete a parent and its subtasks
- **WHEN** the user runs `ot done 3f2a --subtasks` and "Plan trip" has two open subtasks and one completed one
- **THEN** the two open subtasks and "Plan trip" are completed and the completed one is unchanged

#### Scenario: Default unchanged
- **WHEN** the user runs `ot done 3f2a` without `--subtasks`
- **THEN** only "Plan trip" is completed

#### Scenario: Dry run of a cascade
- **WHEN** the user runs `ot rm 3f2a --subtasks --dry-run --json`
- **THEN** the plan lists one delete request per descendant and one for "Plan trip", and nothing is deleted

### Requirement: Subtask tree in CLI output
In `ot list --project` and `ot list --inbox`, the table SHALL print each subtask right after its parent, its title indented two spaces per level. A parent's title SHALL be followed by the number of completed and live direct subtasks (`2/5`). A subtask whose parent isn't listed SHALL be printed at the top level. Other views SHALL stay flat, and the `--json` output of `ot list` SHALL keep its order and shape.

`ot task show` SHALL print the parent path and the direct subtasks with their progress. `ot task show --json` SHALL add a `subtasks` array of the live direct subtasks, empty when there are none.

`--parent` SHALL complete open tasks in the shell completion, and `ot schema` SHALL list `--parent` and `--subtasks` on the commands that take them.

#### Scenario: Nested project list
- **WHEN** the user runs `ot list --project Travel` and "Plan trip" has the open subtasks "Book hotel" and "Flights", one of two done
- **THEN** "Plan trip 1/2" is followed by "  Book hotel" and "  Flights"

#### Scenario: Parent not listed
- **WHEN** "Plan trip" is completed and its subtask "Insurance" is open, and the user runs `ot list --project Travel`
- **THEN** "Insurance" is printed at the top level

#### Scenario: Show a parent
- **WHEN** the user runs `ot task show 3f2a --json`
- **THEN** the output holds `task`, `reminders` and `subtasks`, with "Book hotel" and "Flights" in `subtasks`
