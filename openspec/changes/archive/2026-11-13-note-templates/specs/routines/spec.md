## ADDED Requirements

### Requirement: Create a note from a template step
The catalogue SHALL offer, in the group Notes and text, **Create a note from a template** with the inputs template (a user template chosen in the note picker, or a built-in note template by its slug), title (Text, placeholders allowed; the template's title when empty), project and labels (the template's when empty) and date (Date; the day of the run when empty), and the output Note. It SHALL fill the placeholders of `note-templates` "Placeholders" with that date, the run-as user's preferences and time zone, and plan the new note through the agent tool registry's `create_note` planning, so it writes what the device would. It SHALL be a content step on an encrypted account. A user template in the Trash or out of the routine's reach (another workspace, a project the run-as user can no longer read) SHALL fail the run at the step with reason `template_missing`, and nothing of the run SHALL be written.

#### Scenario: Monday meeting note
- **WHEN** the routine "Monday meeting note" (schedule Monday 09:00: Create a note from the template "Stand-up {{date}}" in Work, then Add to a note "Agenda: …" from a Format text step) runs on 2026-11-16
- **THEN** a note "Stand-up 16/11/2026" is created in Work with the template's text and the agenda at its end, and every device shows it after sync

#### Scenario: Template in the Trash
- **WHEN** the template a routine uses was moved to the Trash before the run
- **THEN** the run fails at that step with "The template is in the Trash", and no note is created

#### Scenario: Encrypted account
- **WHEN** an encrypted account's routine creates a note from a template
- **THEN** the run happens on an opted-in device, and the operations the server applies carry ciphertext

#### Scenario: Wrong type
- **WHEN** a routine's Create a note from a template step reads a Tasks output as its title
- **THEN** the API refuses the routine with 400 `invalid_input` naming the step and input, and the editor shows the same error offline

### Requirement: Monday meeting note starter
The routine starters SHALL include "Monday meeting note" in `templates/routines/monday-meeting-note/`, with a schedule on Mondays, one Create a note from a template step using the built-in Meeting template and a project choice `{ask: project}`, and a test that runs it on a fixed Monday and expects one note with the filled title in the chosen project.

#### Scenario: Use the starter
- **WHEN** the user opens the starter, chooses Work for its project and uses it
- **THEN** the editor opens on an unsaved routine with the step filled, and nothing is written until Save
