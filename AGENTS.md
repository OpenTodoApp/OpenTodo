# Working on OpenTodo (guide for AI coding agents and humans)

## What this is
Open-source, self-hosted, local-first task manager that replaces subscription task apps. Go server + SQLite, React PWA embedded in the binary, field-level op-log sync. AGPL-3.0.

## Non-negotiables
1. **Specs before behavior.** Behavior changes start as an OpenSpec change (`openspec/changes/<name>/`). Use `/opsx:propose`, `/opsx:apply`, `/opsx:archive`. Live specs are in `openspec/specs/`. Validate with `npx @fission-ai/openspec validate --all --strict`.
2. **All data writes go through ops.** Never write task/project rows directly. Server: `internal/sync`. Client: `web/src/lib/ops.ts` → `mutate()`.
3. **Op schema is additive.** New fields: add to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, and the defaults in `web/src/lib/ops.ts`. Never rename or remove a field without a design doc.
4. **Auth required by default.** New API routes are registered with `requireAuth` unless there is a spec reason not to.
5. **No telemetry, no third-party network calls, no new mandatory env vars.**
6. **Keep it small.** Justify every dependency. Report bundle / binary size impact in design docs.

## Layout
- `cmd/opentodo` entry point; `internal/config` env; `internal/store` SQLite + embedded migrations (`internal/store/migrations/NNNN_*.sql`, applied by `PRAGMA user_version`); `internal/auth` users/sessions/tokens; `internal/sync` op log + LWW + materialized reads; `internal/httpapi` router/handlers/middleware; `internal/web` embeds `internal/web/dist`.
- `web/` Vite + React 19 + Tailwind 4 + Dexie. `src/lib` data layer (db, ops, sync, hlc, api, dates), `src/app` UI. Tests: `*.test.ts` with vitest + fake-indexeddb.
- `docs/` architecture, sync protocol, API, self-hosting. `ROADMAP.md` maps features to change names.

## Commands
- `make dev` (API :8080 + Vite :5173), `make check` (what CI runs), `go test ./...`, `cd web && npm test && npm run build`.
- Build the web app before `go build` or tests that import `internal/web` (`make web`); `internal/web/dist/.gitkeep` keeps the embed compiling on a fresh clone.
- Manual smoke: `./bin/opentodo` then open http://localhost:8080; first visit creates the owner account.

## Conventions
- Go: stdlib `net/http` mux with method patterns, JSON error envelope `{error:{code,message}}`, `slog` logging, errors wrapped with context.
- TS: strict, function components, Tailwind classes, data access only via `src/lib`. Custom CSS classes live in `@layer components` so utilities can override them.
- Dates: `due` is a floating `{date: "YYYY-MM-DD", time?: "HH:MM"}`; timestamps are Unix milliseconds.
- Priority: 1 = highest … 4 = default/lowest.
- Deletion is a tombstone (`deleted_at`); lists filter it out, export includes it.
