# Implementation notes

## Manual smoke (task 6.1)

There is no second person or second physical device in the build environment, so the smoke ran as a Playwright script (Chromium from `/opt/pw-browsers`) against a server seeded by `scripts/e2e-layout.mjs` (owner Ada, editor Bob on the shared "Home renovation" project). Two browser contexts signed in as Ada stand in for two devices; `context.setOffline(true)` stands in for the network going away. Every step passed:

- Bob (editor) opened **Fields…** from the project menu and added Cost (number), Client (choice: Acme, Globex) and Quote (link); the three definitions reached the server and both of Ada's devices.
- Both devices offline: device A set Cost 120, device B set Client Acme on "Pick paint colours"; back online, the server and both panels showed Cost 120 and Client Acme.
- Both devices offline again: A set Cost 150, then B set Cost 175; back online, both converged on 175 (the later write) and Client stayed Acme.
- Board at 1280 px: the card showed the badges "Cost 175" and "Client Acme". List at 768 px, light and dark: **Columns** showed the header Task, Cost, Client, Quote. At 390 px, light and dark: no table, the row showed the badges instead.
- Filter view: `cost > 100` listed the task (and the Work task with Cost 12500 from the layout seed: the name matches in every project), `no client` listed the other tasks of projects defining Client, and `client > "A"` showed the text-field error.
- `curl -X PATCH` with a bearer token set the Quote link; the open panel on device A received it, with an open action `rel="noopener noreferrer"`.
- Bob deleted Quote; Ada's export was imported into a fresh server (a new data directory, a new owner): the job counted the live definitions as `fields`, and a fresh export listed the same definitions (ids, names, types, options, projects, deletion state) and the same `fields` values on every task, values of the deleted definitions included.

The layout check (`scripts/e2e-layout.mjs`, new `columns` screen at 768 px with five fields and the `fields-dialog` overlay) passed for Chromium at 390 and 768 px in light and dark; WebKit is not installed here, so CI runs that engine.

## Deviations from design.md

- **Columns layout is a list option, not a fourth view mode.** `task-detail`-era design D5 put `'columns'` into `loadViewMode`, but since `project-timeline` the `v` key cycles list, board and timeline, and the Board view requirement names exactly three layouts. The columns layout is therefore a separate per-project, per-device preference (`list-columns:<project>` in the local `meta` table, `loadListColumns`/`saveListColumns` in `lib/sections.ts`), offered as a **Columns** toggle above the list only while the list layout is shown, the project defines fields and the viewport is at least 768 px. A first version put the toggle into the header's layout group; the layout check showed the header overflowing at 768 px, so it moved above the list.
- **Assistant tools take `fields` in two spellings.** The registry's tool schemas must stay inside the strict subset (`additionalProperties: false`, one type per value) that the in-app assistant sends to providers in strict mode, and an id-keyed map with values of several types is outside it. The advertised schema is therefore a list `[{id, value}]` whose `value` is text read by the field's type ("120", "true", "2026-10-16"); the planner also accepts the object keyed by definition id with typed values (the REST shape, and what the spec scenarios use). Both validate against the definitions of the task's project and fail with `-32602` naming the field and its type. For an encrypted account a string value is refused with `encryption_enabled` (the server cannot encrypt it); numbers and checkboxes still work.
- **History, activity and review wording** read definition names from a small name registry (`lib/fieldNames.ts`) filled by the shared live query of definitions (`app/useFields.ts`), live and deleted ones, so "Cost" shows for `fields.<id>` and the id is the fallback, as the design says. A value change can be restored from the history timeline like other task fields.
- **`tasks-and-projects.md` gets no "Custom fields" section.** That guide page is at 594 of the 600 words a guide may have (docs check), so the user guide lives on a new page, `docs/custom-fields.md` (with its own screenshot, `custom-fields-{light,dark}.webp`, captured from the demo data), linked from filters, views, sections and boards, e2ee, the API, MCP and AI pages. The demo seed gained three fields on "Side project" with values on its undated tasks, so the everyday screenshots (Today, Upcoming, project list, board) are unchanged; the sidebar's Side project count grows by one task ("Write the README").
- **Webhook deliveries** carry the values as `data.task.fields` (the REST shape) and list a changed value as `fields.<id>` in `changes`; the design listed webhooks among the readers to test but did not spell out the payload.
- **Go filter parser.** `internal/filter` (the REST validation of saved views) accepts the same field terms as the client so a saved view with `cost > 100` can be stored through the API; it checks syntax only, the type rules (`client > "A"`) are the client's, as for every other name.
- **The superseded-content purge** (`POST /api/v1/encryption/purge-history`) takes the `fields.` prefix as a family (`e2ee.AllContentFields`), so plaintext history of string values is removed like titles.
- **Drag reorder in the Fields dialog** uses native drag and drop on the rows; the handle is also the keyboard control (`Alt+↑/↓`), and arrow buttons move a field up or down.

## Interactions with landed changes

- `habits`: occurrence records (done or skipped) copy the series' values like any other record; nothing habit-specific.
- `completed-date-filters`: field terms use the same date grammar and periods (`"Order date" = this week`); `completed_by` and the completion range are untouched.
- `named-importers`: not touched. Mapping Linear estimates to a number field stays a follow-up, noted in ROADMAP.md.

## Visual baselines

No shared component in `web/src/ui` and no icon changed, so no Storybook story needs a new visual baseline.

## Archive

The spec deltas were written against older versions of a few requirements. On archive, the statements of "Board view" (sections-and-boards), "Encrypted and plaintext fields" (end-to-end-encryption), "Own export completeness" (data-import) and "Write tools" (mcp-server) were restored to their current wording, and every custom-fields addition that pushed a requirement over the 500-character limit of `openspec validate --strict` became its own requirement with its scenarios, keeping the meaning: "Encrypted custom fields", "Own export restores custom fields", "Custom field terms in the grammar", "Custom field values on tasks" (http-api), "Custom field values of a task" (task-management), "Field badges on cards", "Custom fields in tool results" and "Custom field values in write tools". No other in-flight change modifies these specs.
