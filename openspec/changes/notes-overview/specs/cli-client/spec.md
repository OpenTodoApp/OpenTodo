## ADDED Requirements

### Requirement: Task note command
`ot task note <ref>` SHALL print a task's note as Markdown (its projection followed by pending appends), with `--json` carrying the task id, the text, the pending appends and `body_version`. `--set <text>` and `--file <path>` (`-` for standard input) SHALL replace the note through `PATCH /api/v1/tasks/{id}` with `If-Match` set to the version the command read; `--clear` SHALL replace it with empty text the same way; `--append <text>` SHALL add text at the end through `POST /api/v1/tasks/{id}/note/append` without replacing anything. Only one of these options SHALL be accepted per call (otherwise exit 2). Writes honour `--dry-run` and `--read-only`. On an encrypted account the command SHALL decrypt and encrypt with an unlocked profile and otherwise refuse text writes with `encryption_enabled` (exit 5). The CLI is online-only; devices receive the change on their next sync and fold it into the document.

#### Scenario: Read a task's note
- **WHEN** the user runs `ot task note 8c2a` for a task whose note has a heading and a checklist
- **THEN** the heading is printed as a `#` line and the checklist as `- [ ]` lines

#### Scenario: Replace from a file
- **WHEN** the user runs `ot task note 8c2a --file plan.md` and nobody edited the note since the command read it
- **THEN** the task's note becomes the file's text, shown formatted on every device after sync

#### Scenario: Replace after a concurrent edit
- **WHEN** the note was edited in the app between the command's read and its write
- **THEN** the command fails with `body_changed`, exit 1, and the app's edit stays

#### Scenario: Append
- **WHEN** an agent runs `ot task note 8c2a --append "- called, no answer" --json`
- **THEN** the envelope carries the append id, and every device shows the line at the end of the note after sync, with the rest of the note unchanged

#### Scenario: Two options
- **WHEN** the user runs `ot task note 8c2a --set "x" --append "y"`
- **THEN** nothing is sent and the exit code is 2
