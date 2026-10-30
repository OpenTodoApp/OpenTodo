# Energy as a task property

## Why

People pick their next action by how much energy they have, not only by where they are. The research (`roadmap/research.txt`, §2.3 David Allen, "Energy-State Contexts") notes that modern GTD replaces device contexts with cognitive energy levels (deep focus, medium, low/routine) "so users can filter their available next actions to match their current mental stamina", and the Bento Method (§2.4, D'Alessio) pairs task size with energy: "filter lists by low-energy quick wins at the end of the workday". Today the only workaround is an `@deep` label or a Choice custom field per project: neither works across projects, neither has a quick-add token, and neither can be relied on by other features.

## What Changes

- A task gains an optional **energy**: Deep, Medium or Low (stored as `deep`, `medium`, `low`; empty means none). It is a new additive op field `task.energy`, written offline, converging by last-writer-wins, carried by export, the REST task shape, CSV import, the CLI and the agent tools and MCP.
- **Settings › Account › How you work** gains an **Energy levels** switch (a synced `user_prefs.energy` preference, off by default). Only while it is on do the task page, the docked panel and the row menu offer **Energy**, and does quick add show the token's chip and suggestions. With it off, a value already set (by another device, an import, the API or a collaborator) is still shown where set, and filters still work, so nothing is hidden or lost.
- Quick add recognises `~deep`, `~medium` and `~low` (and the prefixes `~d`, `~m`, `~l`), in every language, in the web and Go parsers with shared vectors.
- The filter language gains `energy` (any energy set), `no energy` and `energy: deep|medium|low`; `energy` becomes a reserved word. The server's saved-view validation accepts them. A view `energy: low & unblocked & today` is the "end of the day" list the research describes.
- A row shows the energy as one muted word ("Deep") only when it is set, as one of the existing row properties a view can hide.
- CalDAV serves and reads `X-OPENTODO-ENERGY:DEEP|MEDIUM|LOW`; the Markdown vault writes and reads `[energy:: deep]`.

Not **BREAKING**: one additive task field and one additive preference, no new route, no new environment variable.

Out of scope: a deep-versus-shallow split in Statistics or the weekly review (a later change can read the field), automatic energy from estimates or labels, energy on projects or sections, grouping by energy in display options, energy in automation rule conditions and actions (a later additive change to `ruleval`), localised token words (the sigil token is language-neutral, see design D4), and any coupling with Bento (`bento-daily-check` reads estimates, not energy).

ROADMAP: milestone 0.18 "The mindful daily planner", item `task-energy`.

## Capabilities

### New Capabilities

- `task-energy`: the field, its entry and display, the How you work switch, and the field in the REST shape, export, CSV, CLI and agent tools.

### Modified Capabilities

- `filter-queries`: ADDED "Energy terms".
- `natural-language-capture`: ADDED "Energy tokens".
- `caldav-sync`: ADDED "Energy as a calendar property".
- `markdown-vault`: ADDED "Energy in task lines".

## Impact

- Data model and sync: `internal/sync/ops.go` `Schema` gains `task.energy` (a new kind `kEnergy`: `""`, `deep`, `medium` or `low`) and `user_prefs.energy` (string); `internal/sync/testdata/schema_fixture.json`; `web/src/lib/types.ts`; defaults in `web/src/lib/ops.ts`. Materialized rows hold fields generically, so no migration.
- E2EE: none. The value is one of three fixed words chosen from a menu, never user-written text, so it is not in `e2ee.ContentFields` or `CONTENT_FIELDS`; on an encrypted account the server can still validate it and the filter terms work offline from the local copy.
- API, CLI, MCP: `energy` in the REST task shape (`GET`/`POST`/`PATCH /api/v1/tasks`), `docs/api.md`; `ot add --energy`, `ot edit --energy`, `ot list` column, `docs/cli.md`; `internal/agenttools` planning properties (`energy` on create and update tools) and the read shape; the MCP tools follow the registry. No new route, so the route matrix is unchanged.
- Parsers: `web/src/lib/nlp`, `internal/quickadd`, `quickadd.vectors.json`; `web/src/lib/filter`, `internal/filter`.
- CalDAV `internal/caldav`; vault `internal/vault` and `docs/vault.md`; CSV in `internal/importer` and the export.
- UI: `web/src/app/method/HowYouWorkSection.tsx`, task facts (`TaskFacts`, `facetsOf`), the row menu, `TaskRow` properties, quick add chips and suggestions; strings in six languages.
- Size: no dependency. Expected web bundle growth under 2 kB gzip; binary growth negligible.
