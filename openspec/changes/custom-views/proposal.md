# Proposal

## Why

A filter query is only useful once it can be kept. People return to the same handful of questions every day ("today's work p1s", "waiting-for items", "errands this week") and want them one keystroke away, on every device, with their preferred grouping and sort. Dashboards go one step further: several saved views side by side for a morning review. Saving views is also the first place a personal preference becomes shared data, so it establishes how such settings sync.

## What Changes

- A new `view` entity synced through the operation log: name, filter query (the query string from `filter-queries`), grouping, sort, pinned flag, position, colour, kind (`list` or `dashboard`), and for dashboards the list of panel view ids.
- Save the current query from the Filter view as a named view; edit a view's query and options later.
- Pinned views appear in a "Views" group in the sidebar, ordered by position, with live open-task counts, each opening the view; `g v` opens the views overview; views are navigable by keyboard.
- Grouping options: by project, due date, priority, label, or none; sort options: due date, priority, position, created, title, ascending or descending. These are stored on the view and sync.
- A default start view per device: the view the app opens on launch (built-in or saved). Device-specific because a phone and a desktop reasonably start differently.
- Dashboards: a view of kind `dashboard` showing up to six panels, each rendering another saved view's count and first tasks, with keyboard navigation between panels.
- REST: `/api/v1/views` collection; the export gains a `views` array.

Depends on `filter-query-language`: a saved view stores a query string in that grammar and inherits its evaluation, warning and error behavior. This change does not extend the grammar.

Out of scope: sharing views with other users (`project-sharing`), charts or statistics widgets beyond counts and task lists, per-view notifications (`reminders`), overriding or hiding built-in views, board rendering of saved views (`board-view` renders projects only), server-side evaluation.

This change advances ROADMAP.md section 3, "Saved filters pinned to the sidebar, custom dashboards".

No new environment variables. No breaking change to the op log: `view` is a new entity; nothing is renamed or removed.

## Capabilities

### New Capabilities
- `custom-views`: the saved view entity, saving from the Filter view, pinned views in the sidebar, grouping and sort options, the per-device start view, dashboards, the views API and export.

### Modified Capabilities
- none.

## Impact

- Server: `view` entity in the op schema and `Plural`; `views` collection handlers with validation of option values; export includes views. No SQL migration.
- Client: `views` table and defaults, save dialog, view runner (query evaluation plus grouping and sort), sidebar group, dashboard layout, start-view preference in `meta`.
- Docs: `docs/sync.md` schema table, `docs/api.md`, `docs/filters.md` (saving section), README.
- No new dependencies; bundle growth expected around 6 KB gzipped.
