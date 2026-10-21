## Context

- "Start a project from a template file" (`project-templates`) is client-side: the dialog parses an own export file (`opentodo-export` v1, optional `template.day`), shows a summary, asks for a start day and a parent, and writes one batch of ops. Everything about copies (fresh ids, labels matched by name, the 1,000-task device limit, offline, convergence) already lives there and is reused unchanged.
- The ten curated templates are Markdown files with YAML front matter in the website repository (`src/content/templates/*.md`): title, summary, category (`Personal`, `Home`, `Work`, `Method`), audience, layout, `howToUse`, `makeItYours`, `sources`, `labels`, `projects` with sections and tasks carrying relative `due` offsets (`+2d`, `+1w`, `+1m`), and prose in the body. The website turns them into export files at build time with name-based ids (`scripts/lib/template-export.mjs`).
- The site bundle (`site-bundle`) already carries generated data for the website (help, method vocabulary, icons) with schema versions and stable paths.
- Change `icons-and-section-style` introduces one icon catalogue (`web/src/ui/icons/catalogue.json`, with a Go copy for validation) and optional section `color` and `icon`.
- The repository already has a dependency-free YAML reader for the deploy templates (`scripts/deploy/yaml.mjs`), mandated as the shared parser by the deploy checks.

## Goals / Non-Goals

**Goals:**
- A contributor can add a good template with one folder and one pull request, and CI tells them exactly what is wrong.
- The library is browsable and startable offline, in the user's language when translated.
- The app and the website show the same library of the same release.

**Non-Goals:**
- A runtime catalogue fetched from the internet, user-published templates, ratings.
- A visual template editor; "Save as template…" keeps producing export files.
- Changing how a copy is made.

## Decisions

### D1. Human-writable YAML sources, compiled at build time
`templates/<slug>/template.yaml` is YAML because contributors write it by hand and review it in a diff: names instead of ids, relative offsets instead of dates, comments allowed. The build compiles every folder into one generated module, `web/src/generated/templates.json` (alongside `help.json`), with ids omitted: instantiation already creates fresh ids. The same compiled form feeds the site bundle.
*Alternatives:* committing export JSON files (unreadable diffs, absolute dates that age); Markdown with front matter like the website (the prose body becomes `description`; front matter alone is enough and avoids two parsers).

### D2. One parser, no new dependency
The build reads YAML with the existing `scripts/deploy/yaml.mjs`, extended if the template files need a construct it lacks (block scalars for `description`), with its tests. The runtime never parses YAML: the app ships JSON.
*Alternative:* adding `yaml` or `js-yaml` as a dev dependency. Rejected: the repository already standardised on its own reader, and the subset needed is small.

### D3. Relative offsets resolve against the start day
Library tasks carry `+Nd`, `+Nw`, `+Nm`. They are resolved on the device when the user confirms the start day (see the modified "Dates shift relative to a start day"): months clamp to the last day, matching the website's `resolveDue`. The compiled template therefore never needs a `template.day`, and the preview shows offsets as "day 3", "week 2", "month 1" instead of dates.

### D4. Translations are overlays keyed by path
`<language>.yaml` holds only strings, keyed by the English file's paths (`projects[0].sections[1].tasks[2].title`, or by stable `key:` fields when a contributor adds them for readability). The compiler merges each overlay over the English text; missing keys fall back to English; a path that does not exist in the English source fails CI (it would mean structure in a translation). Languages are the app's interface languages. Label names are translated too, so an Italian user starting "Trip planning" gets `prenotazione` matched or created by name, consistently with "Labels by name".

### D5. Lazy chunk, offline by the service worker
The compiled library is a separate chunk imported by the template dialog. The service worker precaches it like other chunks, so it is available offline after the first visit of a version. Expected size: the ten initial templates are about 15 KB of JSON raw, under 5 KB gzipped, with all six languages roughly three times that; the main bundle does not change. The server binary grows by the same bytes, embedded with the web app.

### D6. Validation shared by CI, the bundle build and local runs
`scripts/templates-check.mjs` validates sources (D1 fields, enumerations, icons against the catalogue, declared labels, limits, personal-data patterns: e-mail addresses, phone-number shapes, non-https URLs, and `http(s)` links only in descriptions) and is part of `make check` and `make ci-checks`; the site-bundle build calls the same function and fails on the same errors. A vitest (`web/src/app/templates/library.test.ts`) instantiates every compiled template into fake-indexeddb through the dialog's own create function on a fixed start day and checks counts and every resolved date, so the format can never drift from the code that uses it.

### D7. Section style and project icon only through the catalogue
`icon` on a template and on its projects must be a catalogue name; section `color` and `icon` are accepted once `icons-and-section-style` is in, and are validated the same way. Until then the compiler rejects section style with a message naming that change, so the order of the two changes does not matter for correctness.

### D8. The dialog
One dialog, two ways in:

```
+--------------------------------------------------------------+
| New project from a template                              [x] |
| [ Search templates...                     ]  [Upload a file] |
|                                                              |
| Home                                                         |
|  [house] Home maintenance   Seasonal checks, filters...      |
|  [truck] Moving house       Weeks before, the day, after     |
| Personal                                                     |
|  [plane] Trip planning      Bookings, documents, packing     |
| ...                                                          |
+--------------------------------------------------------------+
            | Enter on a card
            v
+--------------------------------------------------------------+
| < Library      [plane] Trip planning                         |
| description (Markdown)                                       |
| How to use it: 1. 2. 3.      Make it yours: 1. 2. 3.         |
| Creates: 1 project, 3 sections, 8 tasks, 2 labels (1 new)    |
|   Book: Flights (day 3), Accommodation (day 4), ...          |
| Start day [today]   Inside [no parent]          [Create]     |
+--------------------------------------------------------------+
```

It is a single overlay with one scroll region, cards as a listbox, category headings, the search field first (interface budget: no extra chrome on any list screen; the dialog replaces the current one). The "From a template…" entry gains a command palette command; no new single-key shortcut.

### D9. Licence and authorship
Contributed templates are content, not code. Templates are licensed CC BY 4.0, like the website's content, stated in `templates/README.md`; every template names its `author`. The pull request template gains a checkbox confirming the contributor may license the text.

### D10. Migration of the ten website templates
A one-off script (not shipped) converts each website Markdown file: front matter fields map one to one; the body becomes `description`; `Personal`/`Home`/`Work`/`Method` map to lowercase categories, with "Study plan" moved to `study`; `sources` become `docs` paths of the app's docs (`/docs/reminders/` → `reminders.md`); `lastReviewed` becomes `reviewed`; `audience`, `tags` and `order` stay website concerns and are dropped. Each template gets an `icon` from the catalogue chosen by hand. The website keeps its own copies until its follow-up change reads the bundle.

## Risks / Trade-offs

- [Contributors submit low-quality or near-duplicate templates] → The library is curated: maintainers review for usefulness, tone (`docs/interface-guide.md`) and overlap; README states the bar ("solves one recurring situation, 5 to 60 tasks, every task is an action").
- [Translations go stale when the English text changes] → CI warns (not fails) when an overlay's key exists but the English text changed since the overlay's recorded `sourceHash`; stale strings still render.
- [Library size grows the bundle] → Limits per template (200 tasks, 64 KB) and a CI budget for the compiled chunk (100 KB gzipped) with a clear message.
- [Two copies during the website transition] → The website follow-up is tracked; until then the website keeps its copies; both come from the same ten sources after migration.

## Migration Plan

Additive. No data migration, no op changes. The old "From a template file" path remains as **Upload a file…**. Rollback is removing the library chunk and the dialog's library view; uploaded files keep working.

## Open Questions

- Whether `make check` should fail or warn on stale translations (see Risks): starting as a warning, decided after the first translated contributions.
