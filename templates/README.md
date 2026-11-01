# The template library

Every folder here is one project template that ships with OpenTodo. In the app it appears under **From a template…** in the sidebar, offline, in the reader's language when a translation exists. The website shows the same library from the release's site bundle.

Anyone can propose a template with one pull request: add a folder, run the check, open the pull request. This page is the whole format.

## The bar

A template earns its place when it:

- solves **one recurring situation** people know: a trip, a move, a weekly review;
- has **5 to 60 tasks**, and every task is an action someone can do ("Book flights", not "Flights");
- reads like the rest of the app: short sentences, no hype, no exclamation marks;
- does not overlap a template that is already here (improve that one instead).

Maintainers review for usefulness, tone and overlap before merging.

## One folder per template

```
templates/
  trip-planning/          the slug: lowercase letters, digits and hyphens, unique
    template.yaml         the template, in English
    it.yaml               optional translations, one file per interface language
```

## template.yaml

A complete example with every field (`#` starts a comment):

```yaml
title: Garden season                       # at most 60 characters, unique in the library
summary: Sow, plant and harvest through the year.   # one sentence, at most 160 characters
description: |                             # Markdown, at most 2,000 characters; https links only
  A season in the garden, from the first seeds to the harvest.

  See [repeating tasks](https://open-todo.app/docs/recurrence/) for the watering.
howToUse:                                  # 1 to 5 short steps
  - Start the template on the day you sow.
  - Move the planting tasks if spring comes late.
makeItYours:                               # 1 to 5 short steps
  - Add the plants you grow.
category: home                             # personal, home, work, study or method
icon: leaf                                 # an icon from the app's project icons
layout: list                               # optional: list or board
author: Your Name                          # who wrote it
reviewed: 2026-10-15                       # when it was last checked against the app
docs: [recurrence.md]                      # optional: pages in docs/ the template relies on
labels:                                    # every label a task uses, declared once
  - name: outside
    color: "#16a34a"                       # optional
projects:                                  # one or more
  - name: Garden
    color: "#16a34a"                       # optional
    icon: leaf                             # optional
    tasks:                                 # optional: tasks outside any section
      - title: Buy seeds
        due: +0d
    sections:                              # optional
      - name: Spring
        tasks:
          - title: Sow tomatoes indoors
            description: Small pots on a sunny windowsill.   # optional, Markdown
            priority: 1                    # optional: 1 (highest) to 4
            due: +1w                       # optional: counted from the start day
            time: "09:00"                  # optional, only together with due
            estimate: 30                   # optional: minutes
            labels: [outside]              # optional: declared above
            subtasks:                      # optional, same fields
              - title: Fill the pots
          - title: Water the seedlings
            due: +1w
            recurrence: every day          # optional: any rule quick add understands
```

### Dates are offsets

A template never holds a date. `due` is counted from the **start day** the user picks when starting the template:

| Offset | Means |
|---|---|
| `+0d` | the start day |
| `+3d` | three days later |
| `+2w` | two weeks later |
| `+1m` | the same day of the next month, or its last day when that month is shorter |

The app shows these as "day 1", "day 4", "week 3" in the preview, before anything is created.

### What the check refuses

`make templates-check` (part of `make check` and CI) fails, naming the template, the file and the path, when a template:

- misses a required field, uses an unknown one, or breaks a length or a value rule above;
- uses a label it does not declare, or an icon that is not one of the app's project icons;
- holds more than 200 tasks and subtasks, or a file is larger than 64 KB;
- contains an e-mail address, a phone number, or a link anywhere but a description (and descriptions link with `https` only);
- has the same English title as another template.

Section colours and icons are accepted once the app supports them on sections (OpenSpec change `icons-and-section-style`); until then the check says so.

## Translations

A translation file holds **text only**, keyed by the path of the English text. Paths count from 0:

```yaml
# templates/garden-season/it.yaml
sourceHash: sha-3f0c1d2e4b5a          # optional: the English text this was made from
title: Stagione dell'orto
summary: Seminare, piantare e raccogliere durante l'anno.
howToUse.0: Avvia il modello il giorno in cui semini.
labels.0.name: fuori
projects.0.name: Orto
projects.0.sections.0.name: Primavera
projects.0.sections.0.tasks.0.title: Semina i pomodori al chiuso
projects.0.sections.0.tasks.0.subtasks.0.title: Riempi i vasetti
```

- Anything not translated shows in English.
- A path that does not exist in `template.yaml` fails the check: a translation never adds or removes tasks.
- File names are the app's interface languages: `de.yaml`, `es.yaml`, `fr.yaml`, `it.yaml`, `pt.yaml`.
- Label names are translated too, so an Italian user's labels are matched or created in Italian.
- `sourceHash` lets the check warn when the English text changed after the translation was made. `node scripts/templates-check.mjs` prints the current hash in that warning; update the translation, then the hash.

## Try it locally

```bash
make templates        # check every template and compile web/src/generated/templates.json
make templates-check  # the same check CI runs, plus its tests
make dev              # then open the app: From a template… lists your template
```

Commit the regenerated `web/src/generated/templates.json` together with your template; CI fails when it is out of date. The web tests also start every template on a fixed day (`web/src/app/templates/library.test.ts`), so a template that the app cannot create fails there.

## Propose a template

1. Fork the repository and add `templates/<slug>/template.yaml`.
2. Run `make templates` and commit the template and the regenerated file.
3. Open a pull request and tick the template line of the checklist.

## Routine templates

`templates/routines/` holds the **routine starters**: ready-made [routines](../docs/routines.md) the app offers under **Routines › Start from a starter**, offline, in the reader's language. A starter is a routine in the engine's own format, plus the **choices** the person makes before it opens in the editor, and a **test** that runs it.

The bar is the one above, plus: a starter solves one everyday situation, uses data that flows from its trigger and earlier steps, and never holds a task chosen by hand. Fixed references are containers only: a project or a label, and those are choices.

```
templates/routines/
  groceries-from-note/    the slug
    routine.yaml          the starter, in English
    it.yaml               optional translations
```

### routine.yaml

A complete example (`#` starts a comment; block style only, the check refuses `{…}` maps):

```yaml
title: Groceries from a note              # at most 60 characters, unique among starters
summary: Every Friday at 17:00, turn the lines of your groceries note into tasks.   # at most 160
description: |                            # Markdown, at most 2,000 characters; https links only
  Keep one project whose note lists what you need, one item per line.
category: home                            # personal, home, work, study or method
icon: shopping-cart                       # from the icon catalogue
author: OpenTodo
reviewed: 2026-11-01
ask:                                      # the choices: a project or a label, with a suggested name
  list:
    type: project
    suggest: Groceries                    # "Create Groceries" when the person has no such project
  into:
    type: project
    suggest: Errands
trigger:                                  # the engine's trigger (docs/api.md, "Routines")
  kind: schedule
  at: "17:00"
  weekdays: [5]
steps:                                    # the engine's steps; {ask: name} stands for the chosen id
  - id: a
    kind: note_text
    in:
      of:
        literal:
          project:
            ask: list
  - id: b
    kind: split_lines
    in:
      text:
        ref: a
  - id: c
    kind: create_tasks
    in:
      text:
        ref: b
      project:
        literal:
          project:
            ask: into
test:                                     # seeded data, the choices filled, the writes expected
  fill:
    list: groc
    into: errands
  projects:
    - id: groc
      name: Groceries
      description: "- oat milk\n- [ ] apples\n"
    - id: errands
      name: Errands
  expect:
    created:
      - title: apples
        project_id: errands
      - title: oat milk
        project_id: errands
```

- `condition` is optional: the engine's condition, as on the When card.
- A choice is used where an id goes: a project in a step (`project: {ask: name}` under `literal`), a label in the trigger (`label_id: {ask: name}`) or in a list of labels. Every choice is used, and every one used is declared.
- Steps are the kinds the editor offers (`web/src/lib/rules/steps.ts`), at most 20. A starter never holds Get a specific task or a `{task: id}` literal.
- The **test** seeds `projects`, `labels` and `tasks` (with `due`, `completed_on`, `labels`, `priority`, `project_id`, `description`), fills every choice with a seeded id, sets `run_on` (a task id) for a routine run on a task and `email: true` when it emails. `expect` lists what the run writes: `created` tasks, `changed` fields per task, `comments`, `appended` notes, `notices`, `emails`, `focus` or `created_count`. The test day is Wednesday 2026-10-21.

### Translations of a starter

The same rules as for project templates. The paths are `title`, `summary`, `description`, `ask.<name>.suggest` and each text of a step, by its path: `steps.2.in.text`, `steps.3.in.subject`, `steps.2.then.0.in.text` (Format text's `template` too). A translated text must insert the same values as the English one: `{b}` stays `{b}`.

```yaml
# templates/routines/groceries-from-note/it.yaml
title: Spesa da una nota
ask.list.suggest: Spesa
ask.into.suggest: Commissioni
```

### Check and test a starter

```bash
make templates        # check, then compile web/src/generated/routineStarters.json and internal/rules/testdata/starters.json
make templates-check  # the check CI runs, plus its tests
go test ./internal/rules -run TestStarters        # runs every starter against its test
cd web && npx vitest run src/lib/rules/starters   # the device's type check, in every language
```

Commit the regenerated files with the starter. To propose one, follow "Propose a template" with `templates/routines/<slug>/routine.yaml`.

## Licence

Templates are content, not code: everything in this folder is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/), like the website's content. By opening a pull request that adds or changes a template you confirm that you wrote it, or may license it under CC BY 4.0, and that `author` names you or the person who wrote it.
