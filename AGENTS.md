# Working on OpenTodo (guide for AI coding agents and humans)

## What this is
Open-source, self-hosted, local-first task manager that replaces subscription task apps. Go server + SQLite, React PWA embedded in the binary, field-level op-log sync. AGPL-3.0.

## Non-negotiables
Each rule in full, and where every package lives: `docs/contributing/packages.md`.
1. **Specs before behavior.** Behavior changes start as an OpenSpec change (`openspec/changes/<name>/`; `/opsx:propose`, `/opsx:apply`, `/opsx:archive`; live specs in `openspec/specs/`; `make openspec-validate`). After ticking tasks, archiving a change or editing `ROADMAP.md`, run `make docs`.
2. **All data writes go through ops.** Server: `internal/sync` (REST writes use `ApplyStrict`, then `NotifyApplied`); client: `web/src/lib/ops.ts` → `mutate()`. Never write task/project rows directly; membership is never an op.
3. **Op schema is additive.** A field is declared once in `internal/sync/ops.go` `Schema`; `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema` regenerates what depends on it. Never rename or remove a field without a design doc.
4. **Auth required by default.** Every route goes through `routes.handle(pattern, policy, handler)` in `internal/httpapi/policy.go` with one declared policy; `public("reason")` only when a spec says so. Routes abusable on a public demo get `.demoDenied()` and an entry in `internal/httpapi/demo.go`.
5. **No telemetry, no third-party network calls by default except maps, no new mandatory env vars.** Outbound requests go only to targets the operator or a user configured, addresses a person typed through `internal/outbound`; maps only through `internal/maps`.
6. **Keep it small.** Justify every dependency; report bundle and binary size impact. The web app's first load has a gzip budget (`web/bundle-budget.json`, `make bundle-budget`): load new code lazily, or raise the budget on purpose and say why.

## Commands
The human contributor guide is `CONTRIBUTING.md` and `docs/contributing/` (first contribution, architecture tour, OpenSpec workflow, tests and checks, adding a language, an importer or a shared contract).
- `make dev` (API :8080 + Vite :5173), `make check` (what CI runs), `go test ./...`, `cd web && npm test && npm run build`.
- Build the web app before `go build` or tests that import `internal/web` (`make web`); `internal/web/dist/.gitkeep` keeps the embed compiling on a fresh clone.
- Manual smoke: `./bin/opentodo` then open http://localhost:8080; first visit creates the owner account.
- Changelog: never edit `CHANGELOG.md` under `## [Unreleased]`. A change adds one file, `changelog.d/<Section>/<name>.md` (Section: Added, Changed, Fixed, Security or Removed; name: the OpenSpec change name or a short slug; content: the entry's bullet in the CHANGELOG style). `make release-prepare` assembles and deletes them; `make repo-check` refuses a misplaced fragment or an entry under Unreleased (`changelog.d/README.md`).
- The in-app help `web/src/generated/help.json` is generated and ignored by git: `npm run help` builds it from `docs/` and runs first in `npm run build`, `dev`, `test`, `typecheck` and the Storybook scripts. Never commit it; after editing docs run `make docs` (the roadmap and keyboard guides, which stay committed) and `make docs-check`.

## Conventions
- Go: time in `internal/httpapi` request logic is `s.now()` and in `internal/auth` `s.clock()`, never `time.Now()` (tests pin or step it with `httpapi.WithClock`, which also sets the auth and sync clocks; the httpapi test env exposes it as `e.now`). Stdlib `net/http` mux with method patterns, JSON error envelope `{error:{code,message}}`, `slog` logging, errors wrapped with context. Functions stay under 150 lines and files under 1,100 (`internal/codesize`, a test-only package); HTTP handlers live by area in `internal/httpapi` (`router.go` registers every route, then `middleware.go`, `auth_handlers.go`, `collections.go`, `sync_handlers.go`, …).
- TS: strict, function components, Tailwind classes, data access only via `src/lib`. Custom CSS classes live in `@layer components` so utilities can override them.
- Design: colours, type, radius, elevation and motion come from the tokens in `web/src/index.css` (no raw palette classes or hex in `web/src/ui`); shared UI is built and checked in the Storybook workbench (`make storybook`, `make ui-check`). Screens use primitives from `web/src/ui`, never emoji or glyphs as icons (`<Icon>`, enforced by `make ui-lint`), and choose entities (people, labels, projects, tasks) with the Combobox. See `docs/design-system.md`.
- Docs: front matter in `docs/` is YAML parsed by both GitHub and `web/scripts/docs/lib.mjs`; double-quote scalar values (such as `summary`) containing `: ` or ending in `:` (`make docs-check` enforces this).
- Dates: `due` is a floating `{date: "YYYY-MM-DD", time?: "HH:MM"}`; timestamps are Unix milliseconds.
- Priority: 1 = highest … 4 = default/lowest.
- Deletion is a tombstone (`deleted_at`); lists filter it out, export includes it.
