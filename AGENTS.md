# Working on OpenTodo (guide for AI coding agents and humans)

## What this is
Open-source, self-hosted, local-first task manager that replaces subscription task apps. Go server + SQLite, React PWA embedded in the binary, field-level op-log sync. AGPL-3.0.

## Non-negotiables
1. **Specs before behavior.** Behavior changes start as an OpenSpec change (`openspec/changes/<name>/`). Use `/opsx:propose`, `/opsx:apply`, `/opsx:archive`. Live specs are in `openspec/specs/`. Validate with `npx @fission-ai/openspec validate --all --strict`.
2. **All data writes go through ops.** Membership is never an op; REST writes use `ApplyStrict` and wake devices with `NotifyApplied`. Never write task/project rows directly. Server: `internal/sync`. Client: `web/src/lib/ops.ts` → `mutate()`.
3. **Op schema is additive.** New fields: add to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, and the defaults in `web/src/lib/ops.ts`. Never rename or remove a field without a design doc. New user-written string fields must also be added to `internal/e2ee.ContentFields` and `CONTENT_FIELDS` in `web/src/lib/e2ee.ts`; server features that show content use `e2ee.Display`/`IsCiphertext` and degrade explicitly.
4. **Auth required by default.** New API routes are registered with `requireAuth` unless there is a spec reason not to. Routes that could be abused on a public demo instance (outbound requests, credentials, settings, members, bulk writes) must also be added to the deny list in `internal/httpapi/demo.go`. API tokens have a scope (`full`|`read`, side table `api_token_scopes`); read tokens are refused on writes and `/api/v1/sync`.
5. **No telemetry, no third-party network calls, no new mandatory env vars.** Outbound requests go only to operator-configured targets (webhooks, backup destinations, push services, the OIDC issuer).
6. **Keep it small.** Justify every dependency. Report bundle / binary size impact in design docs.

## Layout
- `cmd/opentodo` entry point; `internal/config` env; `internal/store` SQLite + embedded migrations (`internal/store/migrations/NNNN_*.sql`, applied by `PRAGMA user_version`); `internal/auth` users/sessions/tokens; `internal/sync` op log + LWW + materialized reads, sharing scopes (`scope.go`) and membership (`members.go`); `internal/httpapi` router/handlers/middleware; `internal/web` embeds `internal/web/dist`; `internal/backup` snapshots, archives, destinations, scheduler, restore; `internal/settings` owner settings and secrets files; `internal/push` VAPID keys, RFC 8291 encryption, subscriptions and the reminder scheduler (service worker side in `web/public/push-sw.js`); `internal/oidc` single sign-on (discovery, PKCE, ID-token verification, `OPENTODO_OIDC_*` overrides; `oidctest` is an in-process provider for tests); `internal/notify` notification sinks (in-app inbox; new event kinds go through optional sink interfaces such as `notify.MentionSink`); `internal/activity` derives activity events from ops and must match `web/src/lib/activity.ts` (shared fixture `internal/activity/testdata/activity_fixture.json`); `internal/caldav` iCalendar/VTODO mapping and WebDAV XML (handlers in `internal/httpapi/caldav*.go`, writes via `ApplyStrict` with device `caldav:<app-password-id>`; app passwords in `internal/auth/apppasswords.go`); `internal/mcp` read-only MCP server (tools/resources over `sync.List`/`Get`, owner toggle `mcp.enabled`; transport in `internal/httpapi/mcp.go`); `internal/email` email to task (optional IMAP polling of one operator mailbox via `OPENTODO_EMAIL_*`, stdlib MIME and IMAP, per-user secret sub-addresses, Message-ID receipts; tasks via `ApplyStrict` with device `server`); `internal/e2ee` end-to-end encryption helpers (content field list, ciphertext detection, key-record store; no crypto on the server; client in `web/src/lib/crypto.ts`, `e2ee.ts`, `e2eeSync.ts`).
- `web/` Vite + React 19 + Tailwind 4 + Dexie. `src/lib` data layer (db, ops, sync, hlc, api, dates), `src/app` UI, `src/ui` shared building blocks (Icon, Button, Field, Switch, Menu items, Combobox, Card, Badge, Avatar, Tabs, patterns; each with stories). Tests: `*.test.ts` with vitest + fake-indexeddb; interaction tests opt into `// @vitest-environment happy-dom`.
- `extension/` browser capture extension (MV3, plain JS; `make extension` builds the zip).
- `docs/` architecture, sync protocol, API, self-hosting. `ROADMAP.md` maps features to change names.

## Commands
- `make dev` (API :8080 + Vite :5173), `make check` (what CI runs), `go test ./...`, `cd web && npm test && npm run build`.
- Build the web app before `go build` or tests that import `internal/web` (`make web`); `internal/web/dist/.gitkeep` keeps the embed compiling on a fresh clone.
- Manual smoke: `./bin/opentodo` then open http://localhost:8080; first visit creates the owner account.

## Conventions
- Go: stdlib `net/http` mux with method patterns, JSON error envelope `{error:{code,message}}`, `slog` logging, errors wrapped with context.
- TS: strict, function components, Tailwind classes, data access only via `src/lib`. Custom CSS classes live in `@layer components` so utilities can override them.
- Design: colours, type, radius, elevation and motion come from the tokens in `web/src/index.css` (no raw palette classes or hex in `web/src/ui`); shared UI is built and checked in the Storybook workbench (`make storybook`, `make ui-check`). Screens use primitives from `web/src/ui`, never emoji or glyphs as icons (`<Icon>`, enforced by `make ui-lint`), and choose entities (people, labels, projects, tasks) with the Combobox. See `docs/design-system.md`.
- Dates: `due` is a floating `{date: "YYYY-MM-DD", time?: "HH:MM"}`; timestamps are Unix milliseconds.
- Priority: 1 = highest … 4 = default/lowest.
- Deletion is a tombstone (`deleted_at`); lists filter it out, export includes it.
