## ADDED Requirements

### Requirement: Routine templates
The library SHALL hold routine templates in `templates/routines/<slug>/routine.yaml`, in English, with optional translation files `<language>.yaml` that hold only text keyed by path. A routine template SHALL carry a title (at most 60 characters), a summary (at most 160), a description (Markdown, at most 2,000), a category, an icon from the catalogue, `author` and `reviewed`, a trigger, an optional condition and steps in the format of `routines` "Routine steps", in which any literal MAY be a placeholder `{ask: <name>}` declared under `ask` with a type (project, section, label, view, webhook, time, weekdays, number or text), a suggested name or value and, for projects and labels, whether the user may create one. `templates/README.md` SHALL document the format with a complete example.

#### Scenario: A contributed starter
- **WHEN** a contributor adds `templates/routines/plant-watering/routine.yaml` with a schedule, two steps and one project placeholder, and opens a pull request
- **THEN** CI validates it, and once merged the next release offers "Plant watering" among the starters

#### Scenario: Translated suggestion
- **WHEN** `templates/routines/groceries-from-note/it.yaml` translates the suggested project name to "Spesa"
- **THEN** an Italian user who uses the starter sees "Crea *Spesa*" as the picker's first entry

### Requirement: Routine template validation
CI SHALL fail, naming the template, the file and the path, when a routine template breaks the format, uses a placeholder it does not declare or declares one it does not use, uses a step kind the catalogue does not have, holds more than 20 steps, does not type-check with the shared step checker once its placeholders are replaced by typed sample values, holds an email address, phone number or a URL other than an `https` link in its description, repeats an English title, or exceeds 16 KB per file. Every starter SHALL also be planned by an automated test through the engine's dry run with its placeholders filled against a fixture account, and every step SHALL plan without error.

#### Scenario: Undeclared placeholder
- **WHEN** a step of `templates/routines/inbox-over-20/routine.yaml` uses `{ask: limit}` and `ask` does not declare it
- **THEN** the check fails with "routines/inbox-over-20: steps[2].in.is: placeholder "limit" is not declared"

#### Scenario: Type error
- **WHEN** a starter's Notify me step reads the tasks of Find tasks
- **THEN** the check fails naming the step, the input and both types

#### Scenario: Not in the catalogue
- **WHEN** a starter holds a step `fetch_url`
- **THEN** the check fails saying the step kind does not exist

### Requirement: Routine starters in the app
The routine starters SHALL be part of each release's web app, available offline without a request, loaded only when the New routine chooser opens, listed as cards grouped by category with a search over title, summary and step names in the user's language and English, and shown in the user's language where a translation exists. A starter's detail SHALL show its description, its steps as sentences and what it needs with the current availability, and SHALL open it in the editor with its placeholders to fill; nothing SHALL be saved until the user saves. The starters SHALL be published in the site bundle with the project templates.

#### Scenario: Offline starter
- **WHEN** the device is offline and the user chooses New routine, From a starter, "Groceries from a note"
- **THEN** the editor opens with the three steps and two choices to fill, and Save works once they are filled

#### Scenario: Needs email
- **WHEN** outgoing email is not set up and the user opens "Friday digest by email"
- **THEN** the detail says "Needs outgoing email, not set up on this server" and, once used, the Email me card reads "Not available"

#### Scenario: Unfilled choices
- **WHEN** the user tries to save a starter with one choice left
- **THEN** Save says "Fill 1 choice first" and nothing is written
