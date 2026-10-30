# Design

## Context

- **The pipeline.** `make docs` (`web` `npm run docs:build`) compiles `docs/` into the website and `web/src/generated/help.json`.
- **The check.** `make docs-check` validates front matter, links, anchors, images, spec coverage and help ids.
- **API routes.** `internal/httpapi/api_docs_test.go` checks that every route is in `docs/api.md`.
- **Error codes.** The client's error code list is `web/src/lib/i18n/server-error-codes.json`.
- **Environment.** Variables are read in `internal/config` (one file per area) and in a few feature packages.
- **Screens.** Pages declare `screens:` in their front matter, and the contextual help requires a declared screen id for each Learn more link.
- **The roadmap.** ROADMAP.md is hand-written, and the OpenSpec state is the folders under `openspec/changes/` and `openspec/changes/archive/`.

## Decisions

**D1. Screen ids from one exported list.**
- `web/src/app/screens.ts` exports `SCREEN_IDS`, the union of:
  - the router's route names (`inbox`, `today`, `project`, `board`, …);
  - the Settings section ids (`settings/notifications`, …);
  - the dialogs that carry a Help action (`share`, `import`, …).
- A unit test checks that each route in the router and each Settings section is in the list, so the list can't drift from the app.
- The docs check reads the list through a small JSON emit at docs build: `web/src/generated/screen-ids.json`, written by the docs build itself and committed like `help.json`. It fails for an id that no page declares.
- Alternative: scraping routes from the built bundle. Rejected as fragile.

**D2. The configuration reference is checked from the source.**
- A Go test in `internal/config` walks every non-test `.go` file under `cmd/` and `internal/` with `go/parser`. It collects the string literal arguments of `os.Getenv`, `os.LookupEnv` and the config helpers that wrap them, keeping names starting with `OPENTODO_`.
- It compares them with the first-column names in the tables of `docs/self-hosting/configuration.md`.
- Both directions fail: a variable read but not documented, or one documented but never read.
- Each row has columns Variable, Default, Example and Explained in (a link), and the docs check verifies the links like any other.
- Alternative: generating the page from the code. Rejected: defaults need prose ("the first owner's email").

**D3. Error codes both ways, examples executed.**
- `api_docs_test.go` gains a check that every code in `server-error-codes.json` appears in the "Error codes" table of `docs/api.md` with its HTTP status, and that every row of that table is in the JSON.
- The codes are gathered by `errors.ts`'s existing list. A code sent by a handler but missing from the JSON is already caught by the i18n check.
- For examples, a fenced block whose info string is `http` and which is preceded by `<!-- run -->` holds a request line, headers and an optional JSON body. It is followed by a `json` response block whose first line comment is the status.
- The test starts the same in-process server the handler tests use (owner signed in, a seeded project and task with fixed ids), replays each example in order, and compares the status. It also compares the response's top-level keys with the documented ones; values may differ.
- At least one `run` example per route group (tasks, projects, sync, import, tokens, settings) is required for 1.0.

**D4. The self-hosting handbook is a path, not a pile.**
- `docs/self-hosting/README.md` has eight numbered sections, each short and linking out:
  1. Install: choose your platform; the 25 pages as a table.
  2. First run and the owner account.
  3. Reverse proxy and TLS: Caddy, nginx and Traefik snippets, and the `OPENTODO_BASE_URL` and proxy header settings.
  4. Backups and a restore drill: a 10-minute exercise that restores into a scratch container and checks `/healthz` and the task count.
  5. Upgrading: the policy page from `stability-contract`, plus the one-line upgrade per platform.
  6. Monitoring: `/healthz`, logs, the nightly alerts, disk use of `<data>`.
  7. Hardening: a checklist of SSO, admin tokens, private network targets, the demo flag off, and the backup destination off-site.
  8. Sizing: the measured numbers from `performance-10k`, such as memory at 10,000 tasks per account and on a Raspberry Pi 4.
- The front matter is `audience: admin`, so the page opens on the website from Help.

**D5. The contributor guide.**
- `CONTRIBUTING.md` keeps ground rules and workflow, and links to `docs/contributing/` (`audience: developer`). It has seven pages:

| Page | Content |
|---|---|
| `first-contribution.md` | clone, `make dev`, find a `good first issue`, a 30-minute walkthrough fixing a copy string end to end |
| `architecture-tour.md` | the request path of one task edit from the UI through `mutate()` to the op log and back, linking `docs/architecture.md` |
| `openspec.md` | when a change needs a proposal, the three commands, what reviewers check |
| `tests-and-checks.md` | what `make check` runs, the CI tiers, how to run one test, the shared fixtures (`docs/contracts.md`) |
| `add-a-language.md` | the `more-languages` kit |
| `add-an-importer.md` | profile, detection signature, sanitiser, fixtures and goldens, switch guide, matrix row |
| `add-a-shared-contract.md` | Go and TS twins, the fixture, the `docs/contracts.md` row |

- AGENTS.md stays the agents' brief and links these pages. The existing "Contributor guide names every server package" requirement is unchanged.

**D6. The roadmap page is generated.**
- The docs build reads ROADMAP.md's milestone tables (the `| Change | What | … |` rows with a backticked change name) and resolves each change:
  - archived under `openspec/changes/archive/*-<name>/` is "Shipped in x.y", with the version read from the first CHANGELOG.md section that mentions the change name or, if none, "Shipped";
  - under `openspec/changes/<name>/` with checked tasks is "In progress (n of m)";
  - with no checked task, or no folder at all, is "Planned".
- The page shows the milestones in order, with the status as a Badge-like text label (no colour-only signal).
- `docs-check` fails when the committed `help.json` roadmap section differs from a fresh build, like the rest of the generated help.
- Alternative: a hand-maintained page. Rejected: it would go stale at the first merge.

**D7. Screenshots for 1.0.** `make docs-screenshots` already regenerates all images. The release checklist (`make release-prepare` for 1.0.0) fails when the newest `docs/images/*.webp` is older than the last commit touching `web/src/app`. This is checked with git timestamps, so a 1.0 release can't ship pictures of an older UI.

## Progressive disclosure and interface budget

The only app change is one "About" group in the Help landing's full guide list, holding "Roadmap". There is no new sidebar destination, no shortcut, and no chrome in task lists.

## Data model

None.

## Size

`help.json` grows by about 30 KB raw (6 KB gzip), and it already loads only when Help opens. The Go tests and scripts are test-only. No dependency.
