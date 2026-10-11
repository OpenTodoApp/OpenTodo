# Proposal

## Why

The importer was written before sections, recurring tasks and reminders existed. As a result it loses data in two places:

- **Own export round trip.** `GET /api/v1/export` now carries `sections`, `reminders`, `views` and `comments` next to labels, projects and tasks, but the `opentodo` profile reads only labels, projects and tasks. Restoring an export into a fresh account loses every section, reminder and saved view. Tasks still point at the missing sections through `section_id`, and reminders are simply gone.
- **Other formats.** Export files from popular commercial task apps often carry recurrence strings ("every tue 4pm", RRULEs), reminders and sections. The importer drops recurrence and reminders with a warning and turns sections into labels, even though OpenTodo now has real recurrence rules (`internal/recurrence`), reminders and sections.

People who move to OpenTodo, or restore a backup export, lose their recurring routines and their board layout. That breaks the "replace your subscription task app" promise right at the start.

## What Changes

- The `opentodo` profile also reads `sections`, `reminders` and `views`. They keep their original ids, like labels, projects and tasks already do, so `task.section_id`, `task.series_id`, `reminder.task_id` and `view.panels` stay valid without remapping. Recurrence rules are stored in canonical form. Every other task field the op schema knows is carried as before (`notes_doc`, `due.tz`, `ical_extra`, `estimate_minutes`).
- Reminders in an own export keep their delivery and dismissal state. If a live reminder's firing time has already passed and the export records no delivery or dismissal for that firing, it is imported as dismissed at import time, so the server does not push a burst of stale notifications.
- Comments in an own export are not imported, and the preview says so in a file-level note with a count. An assignee other than the importing account is dropped with a row warning.
- Foreign formats (CSV, `json-generic`, `json-items`, `json-lists`):
  - Recurrence strings become rules when `internal/recurrence` can express them: the canonical grammar, RRULEs, a documented set of common spellings, and structured `{frequency, interval, days}` objects. Anything else stays a row warning in the preview, and the task is imported without a rule.
  - Reminders (absolute instants, or minutes before the due time) become reminder entities.
  - Sections become real sections of the task's project. This is the new default `sections: section`; `label` and `ignore` still work as before.
- The preview totals gain `newSections`, `recurring` and `reminders`. The response also gains `notes` for file-level remarks.
- Undo also tombstones the sections, reminders and views a job created. As with projects, open tasks the user later put into an undone section leave it.
- The Import screen offers the new section option and shows the new counts and notes.

Out of scope:
- Importing comments, because of comment authorship and the comment rate limit (see design D3).
- Attachments, location reminders, hourly recurrence and other rules the grammar cannot express.
- Remapping own-export ids. Ids are preserved by contract (see design D1).
- Changes to the webhook summary of imports, which another change handles.
- New environment variables and new migrations.

Advances ROADMAP.md section 6, "JSON / CSV import, including export files from popular commercial task apps" (`data-import`). This change fixes a gap in that feature and is not a new roadmap item.

No **BREAKING** change to the op log: no new or renamed op fields, and imported data is plain ops with device `import`. The API changes are additive (`sections: "section"`, new totals fields, `notes`). There is one behaviour change: the default for `sections` moves from `label` to `section`. API clients that want the old behaviour send `sections: "label"`.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- `data-import`: own-export completeness (sections, reminders, views, canonical recurrence); recurrence, reminders and sections from other formats; new preview counts and notes; undo covering the new entities.

## Impact

- Server: `internal/importer` only (profiles, planner, service undo). No change to `internal/sync`, `internal/webhook` or the HTTP layer apart from option values passing through. No new dependency, no migration, no new environment variable.
- Client: `web/src/lib/types.ts` (option and totals types), `web/src/app/ImportScreen.tsx` (section option, counts, notes). The bundle impact is negligible (a few strings).
- Docs: `docs/import.md` (mapping tables, recurrence spellings, reminders, what is not imported and why), CHANGELOG.md (Fixed).
