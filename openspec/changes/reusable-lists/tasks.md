# Tasks

## 1. Data model

- [ ] 1.1 Add `project.reusable`, `project.aisles` (bool, default `false`) and `section.aisle` (nullable string) to `Schema` in `internal/sync/ops.go`, with comments citing this change. Regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync/ -run TestGeneratedOpSchema`. Verify: `go test ./internal/sync/...` passes and `web/src/generated/opSchema.ts` and the contract fixture list the fields as non-content.
- [ ] 1.2 REST validation of `section.aisle` against the nine keys (400 `invalid_aisle`), with the error code added to the error-code fixture. Verify: an `internal/httpapi` test for an unknown key and for each valid key.

## 2. Matching (Go and TypeScript)

- [ ] 2.1 `web/src/lib/reusable.ts`: `normalizeTitle`, `findMatch(projectId, title, tasks)` and `duplicateLosers(projectId, tasks)` (D2, D4), plus `web/src/lib/reusable.vectors.json` (accents, case, `ß`, dotted I, emoji, spaces, trailing full stop, subtasks, several completed matches, open beats completed, attached items never lost). Verify: `reusable.test.ts` with `npm test`.
- [ ] 2.2 `internal/reuse`: the same functions, reading the same vectors file. Verify: `go test ./internal/reuse/...`.

## 3. Server and API

- [ ] 3.1 `reuse` on `POST /api/v1/tasks` (D6): match inside the create transaction, reopen through `ApplyStrict`, the `reused` field, `unavailable` for encrypted accounts and ciphertext titles, `Idempotency-Key` still honoured. Verify: `internal/httpapi` tests for reopened, open, no match, encrypted account, 401 without credentials, 403 viewer, 404 foreign project, and no behaviour change without `reuse`.
- [ ] 3.2 `ot add` sends `reuse: true` for a reusable project unless `--new` is given, and prints "reopened" or "already on the list". `ot project edit --reusable/--no-reusable --aisles/--no-aisles`. Verify: `go test ./internal/cli/...`.
- [ ] 3.3 MCP `create_tasks` and the agent tool registry pass `reuse` for reusable projects and report the result. Project views show `reusable` and `aisles`. Verify: `go test ./internal/agenttools/... ./internal/mcp/...`.

## 4. Web client

- [ ] 4.1 Project Edit dialog: "List" group with the Reusable list and Sort into aisles switches (aisles shown only while reusable is on), disabled for viewers, and the one-time "Add aisle sections?" confirm creating the missing keyed sections in the app language. Verify: an interaction test (happy-dom) and a story in both themes.
- [ ] 4.2 Quick add in a reusable project (D3): reopen or flash, the toast with Add anyway, Undo, and per-line handling for multi-line paste when present. Verify: `quickAdd.reusable.test.tsx` (offline, reopen keeps the section, tokens applied, Add anyway creates, viewer cannot add).
- [ ] 4.3 "Got it" group in a reusable list, overriding the device preference, with the Project menu item and the hidden line suppressed. Verify: a list presentation test and a story.
- [ ] 4.4 Duplicate collapse after pull and after local writes, debounced, never for viewers, labelled in the activity log. Verify: tests that two devices' state converges to the same survivor, and that an item with notes or a reminder is kept.
- [ ] 4.5 Aisle vocabulary `web/src/lib/aisles/{en,de,fr,it,es,pt}.json`, lazy-loaded, with the placement rule (longest match, English fallback, a section token wins). Verify: `aisles.test.ts` and `make bundle-budget` showing no entry-chunk growth.
- [ ] 4.6 Strings in `web/src/locales/messages.json` and the five catalogs (de, fr, it, es, pt). Verify: `node scripts/i18n-check.mjs`.
- [ ] 4.7 `npm run build` and `make ui-lint` pass.

## 5. Documentation and release

- [ ] 5.1 `docs/reusable-lists.md` (the mode, matching rules, duplicates, aisles, encrypted accounts, API), a pointer from `docs/completed-in-projects.md` and `docs/projects.md`, a row in `docs/README.md`, and the `reuse` field and `invalid_aisle` in `docs/api.md`. Verify: `make docs-check`.
- [ ] 5.2 CHANGELOG entry under Unreleased (Added).
- [ ] 5.3 `make check` (TZ=UTC) passes.
