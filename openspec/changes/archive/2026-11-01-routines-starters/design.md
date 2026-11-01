# Design

## Context

- **Template library** (`template-library`, `templates/`, `scripts/templates-check.mjs`, `scripts/templates-build.mjs`): one folder per project template with `template.yaml` and translation overlays; CI validates the format and instantiates each template; the build compiles the library into the web bundle (loaded only with the template dialog), the server copy and the site bundle.
- **Routines** (`routines-engine`, `routines-editor`, `routines-dynamic-data`): `rule.steps`, the shared type checker (`web/src/lib/rules/steps.ts`, Go `internal/ruleval/steps_check.go`), the step catalogue with availability, the editor page (`/routines/new`, `/routines/<id>`) and its handover of a starting draft (`routineNav.ts`).
- **The use-case suite** (`routines-dynamic-data` D12): `web/src/lib/rules/usecases.json` holds 30 buildable routines with seeded data and the exact writes expected; `internal/rules/usecases_test.go` runs each through a real run, `usecases.test.ts` type-checks each. Rows 6, 9 to 15, 21, 23 and 25 are the routines the starters are made of.
- **Decisions** (roadmap DECISIONS.md): "Routines are dynamic, not static" (data flows; no task chosen by hand; fixed references only for containers, never as defaults); "Routines UX": selectors are not modals (anchored lists, inline editing, pages).

## Decisions

**D1. Routine templates live beside project templates.** `templates/routines/<slug>/routine.yaml`. The project template check skips the reserved folder `routines/`, and the routine check owns it. Fields:

```yaml
title: Groceries from a note          # ≤ 60, unique among routine templates
summary: Every Friday at 17:00, turn the lines of your groceries note into tasks.   # ≤ 160
description: |                        # Markdown, ≤ 2,000, https links only
  Keep one project whose note lists what you need...
category: home                        # personal | home | work | study | method
icon: shopping-cart                   # from the icon catalogue
author: OpenTodo
reviewed: 2026-11-01
ask:                                  # the choices, made before the editor opens
  list:
    type: project                     # project | label
    suggest: Groceries                # a name; "Create Groceries" when none exists
trigger: …                            # the engine's trigger
condition: …                          # optional, the engine's condition
steps: …                              # the engine's steps
test: …                               # D3
```

- **Choices.** `{ask: <name>}` stands in place of an id anywhere in the trigger, the condition or the steps: `of: {literal: {project: {ask: list}}}`, `label_id: {ask: waiting}`, `labels: {literal: [{ask: tag}]}`. Filling a choice replaces the placeholder with the chosen id, so a starter is an ordinary routine once its choices are made. Only containers are choices (a project or a label, `routines-dynamic-data` D4); times, numbers and texts are literals the user edits in the editor like in any routine.
- **Translations** (`it.yaml`…) overlay only text, keyed by path, never structure (the project template rule): `title`, `summary`, `description`, `ask.<name>.suggest`, and every text literal of a step (`steps.2.in.text`, `steps.1.then.0.in.text`: the inputs `text`, `title`, `subject`, `template`, `name`, `reason` when they hold a text or a `{format}`). A translated text must insert the same values as the English one (`{b}`, `{trigger}`), so a translation can never break a routine. `sourceHash` works as for project templates.
- The engine's step format is used unchanged.

**D2. Validation in CI.** `scripts/routine-templates.mjs`, run by `make templates-check` through `scripts/templates-check.mjs`, fails naming the template, the file and the path when a routine template:

- breaks the field rules of D1;
- uses a choice it does not declare, or declares one it does not use;
- uses a step kind the catalogue does not have (the kinds of `web/src/lib/rules/steps.ts`);
- holds a task chosen by hand: a `{task: id}` literal or a `get_task` step (`routines-dynamic-data` D11);
- holds more than 20 steps;
- has a translation that changes the values a text inserts;
- holds an email address, phone number or a URL other than an `https` link in its description;
- repeats an English title among routine templates, or exceeds 16 KB per file;
- has no `test`, or a test whose `fill` does not fill every choice.

The type check needs the shared checker, which is TypeScript and Go: `web/src/lib/rules/starters.test.ts` type-checks every compiled starter with its choices filled, and `internal/rules/starters_test.go` runs it (D3). Both run in CI.

**D3. Every starter is a tested routine.** Each `routine.yaml` carries a `test` in the use-case suite's format: `fill` (an id per choice), the seeded `projects`, `labels` and `tasks`, `run_on` for a routine run on a task, `email` when it emails, and `expect` (created tasks, changed fields, comments, appended notes, notices, emails, focus). The build writes every starter with its test to `internal/rules/testdata/starters.json`; `internal/rules/starters_test.go` fills the choices, saves the routine, runs it against the seeded store at the suite's clock and compares the writes exactly, reusing the use-case runner. The test is not part of the app's or the website's copy.

**D4. The eleven starters.** Drawn from the use-case matrix of `routines-dynamic-data` (row numbers in brackets), chosen for everyday use:

| Slug | Category | Trigger | Steps | Choices | Needs |
|---|---|---|---|---|---|
| `groceries-from-note` (6) | home | Friday 17:00 | Get the note text of *list* → Split into lines → Create tasks from the lines in *into* | list, into (projects) | — |
| `sunday-overdue-sweep` (9) | personal | Sunday 18:00, if overdue | Change the matching tasks: due tomorrow → Count → Notify me "{count} tasks moved to Monday" | — | — |
| `evening-roll-over` (21) | personal | every day 21:00, if due today | Change the matching tasks: due tomorrow → Count → Notify me | — | — |
| `morning-focus` (12) | personal | weekdays 07:30 | Find tasks due today → Sort by priority → Pick the first 3 → Set today's focus | — | focus |
| `done-journal` (23) | personal | a task is completed | Add "Done: {the task}" to the note of *journal* | journal (project) | — |
| `note-to-subtasks` (25) | personal | run on a task | Get the note text of the task you run it on → Split into lines → Create subtasks of the task | — | — |
| `waiting-follow-up` (10) | work | a task gets the label *waiting* | Get the date today → Comment on the task that triggered "Waiting since {date}" → Change it: due in 3 days | waiting (label) | — |
| `friday-digest-email` (11) | work | Friday 16:00 | Find tasks completed this week → Count → Format text → Email me | — | email |
| `meeting-notes-to-tasks` (15) | work | run on a task | Get the note text of the task you run it on → Split into lines, only open checkboxes → Get the project of the task → Create tasks from the lines in it | — | — |
| `inbox-over-20` (13) | method | weekdays 09:00 | Find tasks with no project → Count → If more than 20: Notify me | — | — |
| `monthly-review` (14) | method | every month on day 1 | Create a project from the template "Weekly review" starting the day | — | — |

No starter holds a task chosen by hand. Each has an English source and the five translations.

**D5. Starters in the app.** No centred modal: the starters are pages and inline pickers (DECISIONS.md "Routines UX").

- **Entries.** The Routines page header gets **Start from a starter** beside **New routine**. With no routine yet, the empty state offers both, and the starters list sits below it.
- **The starters page** (`/routines/starters`) has a search field and the starters as cards grouped by category. The search runs offline over title, summary and step names, in the user's language and in English. The starters are one JSON module, `web/src/generated/routineStarters.json`, loaded only when the list is shown.
- **A starter's page** (`/routines/starters/<slug>`) shows:
  - the description;
  - the trigger and steps as the editor's sentences;
  - **Needs**: a step not available now is named with the catalogue's reason ("Needs outgoing email: outgoing email is not set up on this server");
  - **Choices**: one inline Combobox per choice. A project or label with the suggested name (in the user's language) is chosen already. Otherwise the list starts with "Create *Groceries*", which creates it through the op log, offline included.
- **Use this starter** stays disabled while a choice is empty ("Fill 1 choice first"). It hands the filled routine to `/routines/new` (the handover of `routineNav.ts`), with the starter's title as its name and its texts in the user's language. The editor opens it unsaved, as any new routine: nothing is written until Save, except a project or label the user chose to create.
- **Keyboard.** The search field has focus. Down moves into the cards, arrows move between them, Up from the first returns to the search, Enter opens one. On a starter's page, Back and Escape return to the list.

**D6. Website.** `scripts/site-bundle.mjs` writes `templates/routines.json` (every starter with its metadata, text, translations, choices, trigger, condition and steps, without its test), and the manifest gains a `routineTemplates` fact (the slugs), so the website can show them. The website change is separate.

## Data model impact

None in the op schema: a routine started from a starter is an ordinary routine, saved through the op log like any other. Creating a project or label from a choice is the ordinary create operation. Offline: the starters are in the app bundle, so the list, a starter's page, the choices (from local data) and Use this starter work without a connection; Save syncs later as for any routine. Convergence: unchanged (whole-value routine fields, last writer wins).

## Size and memory

No new dependency. The starters compile to about 25 KB of JSON (about 7 KB gzip, all six languages), a lazy chunk loaded with the starters list. The starters page and a starter's page join the routines chunk, already lazy (about 3 KB gzip). First load unchanged: `make bundle-budget`. Server: nothing at run time (the starters are test data there).

## Interface budget

- **Chrome rows:** the Routines page keeps its header row (one more button in it) and its tabs. The starters page has its header and the search row: 2.
- **Sidebar destinations:** none.
- **Scroll regions:** the page: 1.
- **Shortcuts:** none new; the library's keys (D5) are local to the list.

## Open questions

- **Folder.** Default chosen: `templates/routines/<slug>/routine.yaml` beside project templates. The owner may prefer a separate top-level folder.
- **The first eleven starters.** Default chosen: the list in D4; the owner may swap any.
