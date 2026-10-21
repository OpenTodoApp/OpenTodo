## Purpose
Ships a small, curated library of project templates with every release: written in a documented source format in the app repository, contributed and reviewed as pull requests, validated by CI, browsable offline in the app and published to the website through the site bundle.

## ADDED Requirements

### Requirement: Template sources in the repository
The app repository SHALL hold the library in a top-level `templates/` folder, one folder per template named by its slug (lowercase letters, digits and hyphens, unique), containing `template.yaml` and optional translation files `<language>.yaml` for the app's interface languages. `template.yaml` SHALL hold, in English:

- `title` (at most 60 characters) and `summary` (one sentence, at most 160 characters);
- `description` (Markdown, at most 2,000 characters), `howToUse` and `makeItYours` (each one to five short steps);
- `category`, one of `personal`, `home`, `work`, `study`, `method`;
- `icon`, a name from the app's project icon catalogue, and optional `layout` (`list` or `board`);
- `author` and `reviewed` (a date), and optional `docs` (paths of user documentation pages the template relies on);
- `labels` (name and optional colour), then `projects`, each with a name, optional colour and icon, optional `sections` and `tasks`; a task SHALL carry a title and MAY carry a description, priority, a relative `due` offset (`+Nd`, `+Nw` or `+Nm`, counted from the start day), a `time` only together with `due`, a recurrence rule, an estimate in minutes, labels declared in `labels`, and subtasks.

A translation file SHALL hold only translated text keyed by the same paths (title, summary, description, steps, label, project, section and task names), never structure. The folder SHALL contain a `README.md` documenting the format with a complete example, how to try a template locally and how to propose one by pull request, and the licence under which templates are contributed.

#### Scenario: A contributed template
- **WHEN** a contributor adds `templates/garden-season/template.yaml` with a title, summary, description, category `home`, icon `leaf`, two sections and eight tasks with offsets `+0d` to `+8w`, and opens a pull request
- **THEN** CI validates it and runs it through the template test, and once merged the next release lists "Garden season" in the library

#### Scenario: Translation overlay
- **WHEN** `templates/trip-planning/it.yaml` translates the title, summary and the section and task names but not the description
- **THEN** an Italian user sees the Italian title, summary and names and the English description, and the template's structure is the one in `template.yaml`

#### Scenario: Structure in a translation file
- **WHEN** `templates/trip-planning/de.yaml` adds a task that `template.yaml` does not have
- **THEN** CI fails and names the file and the path that is not in the English source

### Requirement: Library validation in CI
CI SHALL fail when any template breaks the format, and SHALL name the template, the file and the path. Besides the field rules above, a template SHALL: declare every label its tasks use; use an icon that exists in the catalogue; hold at most 200 tasks and subtasks and at most 64 KB per file; contain no e-mail address, phone number or URL other than `https` links in descriptions; have a unique title in English. Every template SHALL also be instantiated by an automated test through the same code path the app uses to start a template, on a fixed start day, and the test SHALL check the number of projects, sections, tasks and labels created and every resolved due date.

#### Scenario: Undeclared label
- **WHEN** a task in `templates/moving-house/template.yaml` uses the label `boxes` and `labels` does not declare it
- **THEN** the check fails with "moving-house: tasks[3].labels: label "boxes" is not declared"

#### Scenario: Personal data
- **WHEN** a task description contains `call Anna on +39 333 1234567`
- **THEN** the check fails and names the template and path as holding a phone number

#### Scenario: Instantiation test
- **WHEN** the library test starts "Trip planning" on 2026-01-05
- **THEN** it creates one project, three sections, eight tasks with two subtasks and two labels, and the passport task is due 2026-01-05 and the packing tasks 2026-02-02

### Requirement: The library in the app
The library SHALL be part of each release's web app and SHALL be available offline, without a request to any server. It SHALL be loaded only when the template dialog opens, not with the first screen. The library view SHALL show every template as a card with its icon, title and summary, grouped by category, with a search field that matches the title, summary, category and label and task names in the user's interface language and in English, and SHALL show the template's text in the user's interface language where a translation exists, in English otherwise. Choosing a card SHALL show the template's description, its "how to use it" and "make it yours" steps, and a preview listing the projects, sections and tasks it creates with each dated task's offset from the start day ("day 1", "week 2"), the labels it adds or reuses and how many tasks it creates.

#### Scenario: Offline library
- **WHEN** the device is offline and the user opens "From a template…"
- **THEN** the library lists every template of the release and the user can start one

#### Scenario: Search
- **WHEN** the user types "pack" in the library
- **THEN** "Trip planning" and "Moving house" are listed, because tasks in them mention packing, and the other templates are hidden

#### Scenario: Preview before creating
- **WHEN** the user chooses "Moving house"
- **THEN** the dialog shows its description, its steps and a preview of its sections and tasks with "day 1", "week 2" and similar offsets, and nothing has been written yet

### Requirement: Library keyboard and accessibility
The library SHALL be fully usable by keyboard: the search field has focus when the dialog opens; arrow keys move between cards; Enter opens a card's detail; Escape returns from the detail to the library and closes the dialog from the library; the detail's primary action starts the template. Cards SHALL be a list with accessible names made of the title and summary, the category groups SHALL be headings, and the number of templates matching a search SHALL be announced.

#### Scenario: Keyboard only
- **WHEN** the user opens the dialog, types "things done", presses Down, Enter, then Enter on "Create"
- **THEN** the "Getting Things Done setup" template is started on today's start day without the mouse

### Requirement: Library templates reach the website
The compiled library SHALL be published in the site bundle with, for every template, its slug, metadata, English text and translations, and its structure with relative offsets, so the website can render the template pages and produce downloadable template files from the released library. The bundle's manifest SHALL list the slugs of the library in a `templates` fact.

#### Scenario: New template on the website
- **WHEN** a release adds "Garden season" to the library
- **THEN** that release's site bundle contains it and the manifest's `templates` fact lists `garden-season`
