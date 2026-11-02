## ADDED Requirements

### Requirement: Routine templates
The library SHALL hold routine templates in `templates/routines/<slug>/routine.yaml`, in English, with optional translation files `<language>.yaml` that hold only text keyed by path. A routine template SHALL carry a title (at most 60 characters), a summary (at most 160), a description (Markdown, at most 2,000), a category, an icon from the catalogue, `author` and `reviewed`, a trigger, an optional condition, steps in the format of `routines` "Routine steps", and a test. In place of a project or label id it MAY hold a choice `{ask: <name>}` declared under `ask` with its type (project or label) and a suggested name. A starter SHALL NOT hold a task chosen by hand. A translation SHALL insert the same values as the English text it translates. `templates/README.md` SHALL document the format with a complete example.

#### Scenario: A contributed starter
- **WHEN** a contributor adds `templates/routines/plant-watering/routine.yaml` with a schedule, two steps, one project choice and a test, and opens a pull request
- **THEN** CI validates and runs it, and once merged the next release offers "Plant watering" among the starters

#### Scenario: Translated suggestion
- **WHEN** `templates/routines/groceries-from-note/it.yaml` translates the suggested project name to "Spesa"
- **THEN** an Italian user without a project of that name sees "Crea *Spesa*" first in the choice's list

### Requirement: Routine template validation
CI SHALL fail, naming the template, the file and the path, when a routine template breaks the format, uses a choice it does not declare or declares one it does not use, uses a step kind the catalogue does not have, holds a task chosen by hand (a `{task}` literal or a Get a specific task step), holds more than 20 steps, has a translation that changes the values a text inserts, holds an email address, phone number or a URL other than an `https` link in its description, repeats an English title, exceeds 16 KB per file, or has no test filling every choice. Every starter SHALL also be type-checked by the device's checker with its choices filled, and run by an automated test through the engine against its seeded data, and the run SHALL write exactly what its test expects.

#### Scenario: Undeclared choice
- **WHEN** a step of `templates/routines/done-journal/routine.yaml` uses `{ask: log}` and `ask` does not declare it
- **THEN** the check fails with "routines/done-journal/routine.yaml: steps[0].in.of.literal.project: choice "log" is not declared"

#### Scenario: A task chosen by hand
- **WHEN** a starter holds a Get a specific task step
- **THEN** the check fails saying a starter never holds a task chosen by hand

#### Scenario: Not in the catalogue
- **WHEN** a starter holds a step `fetch_url`
- **THEN** the check fails saying the step kind does not exist

#### Scenario: A translation drops a value
- **WHEN** the German text of Sunday overdue sweep's notification leaves out `{b}`
- **THEN** the check fails naming the file and the path

#### Scenario: The run does not match
- **WHEN** a change to the engine makes Groceries from a note create one task fewer from its seeded note
- **THEN** the Go test of the starters fails naming the starter and the difference

### Requirement: Routine starters in the app
The routine starters SHALL be part of each release's web app, available offline without a request, and loaded only when a starters list is shown. The Routines page SHALL offer "Start from a starter" beside "New routine", and SHALL list the starters under its empty state. The starters page SHALL list them as cards grouped by category, with a search over title, summary and step names in the user's language and English, shown in the user's language where a translation exists. A starter's page SHALL show its description, its steps as sentences, what it needs with the current availability, and its choices as inline pickers: a project or label of the suggested name is chosen already, otherwise "Create <name>" comes first. "Use this starter" SHALL stay disabled until every choice is made, and SHALL open the editor on an unsaved routine; nothing but a project or label the user chose to create SHALL be written until the user saves. No step of this SHALL use a centred modal. The starters SHALL be published in the site bundle with the project templates, without their tests.

#### Scenario: Offline starter
- **WHEN** the device is offline and the user chooses Start from a starter, "Groceries from a note", fills its two choices and uses it
- **THEN** the editor opens with the three steps, unsaved, and Save works and syncs later

#### Scenario: Needs email
- **WHEN** outgoing email is not set up and the user opens "Friday digest by email"
- **THEN** the starter's page says the Email me step needs outgoing email, and, once used, the Email me card reads "Not available"

#### Scenario: Unfilled choices
- **WHEN** one of a starter's choices is still empty
- **THEN** Use this starter is disabled and reads "Fill 1 choice first", and nothing is written

#### Scenario: Empty Routines page
- **WHEN** a user without routines opens the Routines page
- **THEN** the empty state offers New routine and Start from a starter, with the starters listed below

#### Scenario: Keyboard
- **WHEN** the user opens the starters page, presses Down twice and Enter
- **THEN** the second starter's page opens, and Escape returns to the list
