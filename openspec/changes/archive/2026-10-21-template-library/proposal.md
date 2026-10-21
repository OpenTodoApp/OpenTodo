## Why

Starting a project from a template today means finding a file first: "From a template…" only accepts an upload, and the ten curated templates (trip planning, moving house, GTD set-up and others) live only on the website, as Markdown in the website repository that nobody contributing to the app sees. People who open the dialog want to browse a small, well described library right there, and people who want to share a good template have no obvious place to send it.

## What Changes

- A top-level `templates/` folder in the app repository holds the curated library, one template per folder in a documented, human-writable source format (YAML: metadata, descriptions, labels, projects, sections, tasks with relative due offsets such as `+2d`), with optional translations. A `templates/README.md` documents the format and how to contribute one by pull request.
- CI validates every template (schema, declared labels, icons from the shared icon catalogue, size limits, no personal data, every translation complete for the keys it provides) and instantiates each one through the real template code path in a test, so a template that would not start cleanly cannot be merged.
- The library is compiled at build time into the web app (and so into the server binary that embeds it) and loaded on demand, so it works offline and costs the main bundle nothing.
- "From a template…" opens on a **library**: search, categories, cards with icon, title and one-line summary; a detail view with the description, "how to use it", "make it yours" and a preview of the projects, sections and tasks it creates with their relative dates; then start day and parent as today. **Upload a file…** stays in the same dialog for template files.
- The site bundle carries the compiled library, so the website can render its template pages and downloads from the released library instead of keeping its own copies.
- The website's ten existing templates move into `templates/` as the initial library.

Out of scope:
- The website-side switch to the bundle's templates (a follow-up change in the website repository; until then the website keeps its copies).
- Templates from other people's servers, a remote catalogue, ratings or uploads to a shared gallery: the library is what the release ships.
- Server-side or CLI instantiation of library templates (`ot` keeps importing files).
- Changes to what a copy carries or how dates shift: the existing `project-templates` rules apply unchanged.

ROADMAP: advances item 7, **Project templates and duplication** (`project-templates`), whose notes already promise "the website's templates install in one click".

No **BREAKING** change: no new environment variable, no op-log change. A template may use section colours and icons and the project icon catalogue only as far as the change `icons-and-section-style` defines them; until it lands, the format accepts the project icon only.

## Capabilities

### New Capabilities
- `template-library`: the curated templates shipped with each release: the source format and folder, contribution and CI validation, localisation, the in-app library (browse, search, preview, start), and how the library reaches the website.

### Modified Capabilities
- `project-templates`: "Start a project from a template file" becomes "Start a project from a template": the dialog opens on the library and keeps uploading a file as a second way in; the reference day rule covers library templates, whose dates are offsets from the start day.
- `site-bundle`: the bundle gains the compiled template library and a `templates` fact in the manifest.

## Impact

- New: `templates/` (sources, `README.md`), a build step that compiles it into a generated module of the web app (like the help bundle), a validation script run by `make check` and CI, a vitest that instantiates every template.
- Web: the "From a template…" dialog (`web/src/app`), the template parser for library sources, lazy-loaded library chunk; i18n keys for the dialog; the templates' own text is translated in the template files, not in the app catalogues.
- Site bundle: `templates/` inside the archive and a manifest fact; documented in the bundle layout.
- Docs: `docs/templates.md` (library, contributing), `CONTRIBUTING.md` pointer.
- No new runtime dependency (YAML is read at build time by an existing dev dependency or a small build-time parser; decided in design).
