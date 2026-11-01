# Design

## Context

- **Template library** (`template-library`, `templates/`, `scripts/templates-check.mjs`, `scripts/templates-build.mjs`): one folder per project template with `template.yaml` and translation overlays; CI validates the format and instantiates each template; the build compiles the library into the web bundle (loaded only with the template dialog) and the site bundle. `routines-engine` embeds the same built JSON in the server for its "Create a project from a template" step.
- **Routines** (`routines-engine`, `routines-editor`): `rule.steps`, the shared type checker (`web/src/lib/rules/steps.ts`, Go `internal/ruleval/steps.go`), the step catalogue route with availability, the draft test route, and the sentence-card editor with placeholders.
- **Assistant** (`in-app-assistant`, `internal/assistant`): owner-configured providers, per-user consent, member keys, the monthly allowance and usage, tools from the shared registry that only plan, the on-device assistant for encrypted accounts, untrusted-text marking. Skills (`assistant-skills`) are fixed instructions over the same loop.

## Decisions

**D1. Routine templates live beside project templates.** `templates/routines/<slug>/routine.yaml`, so the project template check keeps its rule "one folder per template with `template.yaml`" for the top level and the routine check owns `templates/routines/`. Fields:

```yaml
title: Groceries from a note          # ≤ 60
summary: Every Friday, turn the lines of your groceries note into tasks.   # ≤ 160
description: |                        # Markdown, ≤ 2,000
  Keep one note with what you need...
category: home                        # personal | home | work | study | method
icon: cart                            # from the icon catalogue
author: OpenTodo
reviewed: 2026-11-15
ask:                                  # placeholders, each filled in the editor
  list: {type: project, suggest: Groceries, create: true}
  into: {type: project, suggest: Errands, create: true}
trigger: {kind: schedule, at: "17:00", weekdays: [5]}
steps:
  - {id: a, kind: note_text, in: {of: {ask: list}}}
  - {id: b, kind: split_lines, in: {text: {ref: a}}}
  - {id: c, kind: create_tasks, in: {text: {ref: b}, project: {ask: into}}}
```

- Placeholders are `{ask: <name>}` in place of a literal; `ask` declares each with a type (`project`, `section`, `label`, `view`, `webhook`, `time`, `weekdays`, `number`, `text`), a suggested name or value, and for projects and labels `create: true` to offer creating one with the suggested name.
- Translations (`it.yaml`…) overlay only text: title, summary, description, the suggested names and the text literals of steps (format templates, notify texts), keyed by path; never structure (the project template rule).
- The engine's step format is used unchanged, so a starter is a routine once its placeholders are filled.

**D2. Validation in CI.** `scripts/templates-check.mjs` gains the routine rules, failing with template, file and path: the field rules above; every `ask` used is declared and every declared one used; the steps type-check with the shared checker (run from the vectors' TypeScript module) after replacing placeholders with typed sample values; step kinds exist in the catalogue; no `{task: id}` literal and no `get_task` step (`routines-dynamic-data`: starters never hold a task chosen by hand); no fetch, email-to-address or other step the catalogue does not have; at most 20 steps; no email address, phone number or URL other than `https` links in descriptions; unique English title; at most 16 KB per file. A Go test (`internal/rules`) plans every starter with its placeholders filled against a fixture account through the dry run and checks each step's status is `ok` (or `ended` where the starter ends by design).

**D3. The eight starters.**

| Slug | Trigger | Steps | Needs |
|---|---|---|---|
| `groceries-from-note` | Friday 17:00 | Get the note text of *list* (a project) → Split into lines → Create tasks from the lines in *into* | — |
| `sunday-overdue-sweep` | Sunday 18:00, condition overdue | Change the matching tasks: due tomorrow → Count → Notify me "{count} tasks moved to Monday" | — |
| `waiting-follow-up` | a task gets the label *waiting* | Get the date today → Comment on the task that triggered "Waiting since {date}" → Change it: due in 3 days | — |
| `friday-digest-email` | Friday 16:00 | Find tasks `completed = this week` → Count → Format text → Email me | email |
| `morning-focus` | weekdays 07:30 | Find tasks due today → Sort by priority → Pick the first 3 → Set today's focus | focus |
| `inbox-over-20` | weekdays 09:00 | Find tasks `no project` → Count → If more than *n*: Notify me | — |
| `monthly-review-project` | every month on day 1 (`month_days: [1]`) | Create a project from the template "Weekly review" starting the day | — |
| `meeting-notes-to-tasks` | manual, run on a task | Get the note text of the task you run it on → Split into lines, only open checkboxes → Get the project of the task → Create tasks from the lines in the task's project | — |

Starters follow `routines-dynamic-data`: data flows from the trigger and earlier steps, and no starter holds a task chosen by hand. The table above is that change's D11; the project literal on `of`, Get the date, Get the project of a task, Find over completed tasks and `month_days` come with it.

Each has an English source and the five translations at release.

**D4. Start from a starter.** "New routine" (page, palette) opens a chooser sheet with three choices: **Start empty**, **From a starter**, **Describe it** (D5; hidden as stated there). From a starter lists the routine templates as cards grouped by category with a search field over title, summary and step names in the user's language and English, offline, loaded only when the chooser opens. A card's detail shows the description, its steps as sentences, what it needs (email, focus) with the availability from the cached catalogue, and **Use this starter**. That opens the editor with the starter's steps and its placeholders as accent words; for a project or label placeholder with `create: true`, the picker's first entry is "Create *Groceries*". Save is disabled until every placeholder is filled ("Fill 2 choices first"). The saved routine carries no trace of the template except its name; translations apply once, at use.

**D5. Describe it.**

- **Visible** only when the user can make an assistant turn: on a plaintext account, the assistant is on and the user has consented for the current provider (or their own key); on an encrypted account, the on-device assistant is set up on this device and consented. Otherwise it is absent from the chooser, and search in the chooser for "describe" or "AI" shows "Set up the assistant to describe a routine" with a link.
- **Request:** a sheet with one text field ("Describe what should happen, and when"), at most 500 characters, and Draft. The server route `POST /api/v1/assistant/routine-draft` (session only, like the turn route) runs one assistant turn with fixed instructions, the catalogue of **available** steps as the schema of one tool `draft_routine` (its input is a routine: name, trigger, condition, steps, in the engine's JSON), and as context the names and ids of the user's projects, sections, labels, views and webhooks (the fields the consent disclosure already lists). The model may call no other tool. The server type-checks the draft; if it fails, the errors go back to the model once; if it fails again, the answer carries the draft and its errors.
- **Answer:** `{draft, errors, warnings, usage}`; the editor opens the draft with a banner "Drafted by AI: check each step, then Save", errors shown on their cards with fixes (routines-editor D5). The route and the device **never** save, enable, test or run the draft; the user does.
- **Limits and usage:** one turn: it counts toward the monthly allowance, is refused with 429 `assistant_quota` at the cap, 409 `turn_in_progress` while another turn runs, and records usage like any turn; at most 10 drafts per user per hour (429 `rate_limited`).
- **Encrypted accounts:** the same request runs in the browser through the on-device assistant with the device's provider and key, with the decrypted names as context and the same tool and check (the shared TypeScript checker); nothing reaches the OpenTodo server.
- **Untrusted text:** the user's sentence is the user's own request; project, label and view names in the context are marked untrusted like every tool result, and the instructions say to ignore instructions inside them.
- **Demo:** the route is under the assistant's routes, which the demo refuses.

**D6. Website.** `scripts/templates-build.mjs` puts routine templates into the site bundle with their slug, metadata, text, translations and steps, and the manifest gains a `routineTemplates` fact, so the website can show them; the website change is separate.

## Data model impact

None in the op schema: a routine started from a starter or a draft is an ordinary routine. Library files are repository data compiled into the bundles. The assistant's usage record gains a `kind: routine_draft` tag (server state).

## Size and memory

No new dependency. Starters compile to about 12 KB of JSON (about 4 KB gzip) loaded with the chooser; the chooser and the Describe it sheet join the editor's lazy chunk (about 4 KB gzip). First load unchanged. The server embeds the routine starters with the library (about 12 KB) for the planning test and the site bundle; the route holds one draft in memory.

## Interface budget

- **Chrome rows:** the chooser is a sheet with its title row and, in From a starter, the search row: 2.
- **Sidebar destinations:** none.
- **Scroll regions:** the sheet's list: 1.
- **Shortcuts:** none new; the library's keyboard rules (search focused, arrows, Enter, Escape) apply to the starter list.

## Open questions

- **Folder.** Default chosen: `templates/routines/<slug>/routine.yaml` beside project templates. The owner may prefer a separate top-level folder.
- **The first eight starters.** Default chosen: the list in D3; the owner may swap any.
- **Drafts per hour.** Default chosen: 10 per user per hour, on top of the monthly allowance.
