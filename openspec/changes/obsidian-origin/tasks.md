# Tasks

Backend tasks are verified with `go test ./...`, web tasks with `npm test` and `npm run build` in `web/`, shell tasks with `make android` and `make ios`. `make check` runs before the last task is ticked.

## 1. Shared vectors

- [ ] 1.1 Add an `obsidian` section to `internal/origin/testdata/origin_vectors.json`: accepted (plain note, note in a sub-folder, vault name with a space, `&`, `#` and non-Latin letters percent-encoded, `file` with an explicit `.canvas` extension), refused (`obsidian://new`, `obsidian://search`, `obsidian://adv-uri`, `path=` instead of `file=`, an extra `content=` member, a repeated `vault`, a fragment, user info, empty `vault` or `file`, `file` over 1024 characters, URL over 2048 bytes, `id` not matching `file`, a `provider` present, no `url`), and `{kind: "url", url: "obsidian://open?..."}` refused. Each accepted case also records its chip label and tooltip. Verified by the vector files being read by both test suites below.

## 2. Server and CLI

- [ ] 2.1 `internal/origin`: `KindObsidian`, `Kinds` gains it, `ValidObsidianURL(url, id)` per design D2, `Validate` applies it only to the new kind and refuses `provider` on it, `Label()` returns the title or the note name (design D5). Verified by `go test ./internal/origin/...` running the new vectors.
- [ ] 2.2 Sync, REST, importer and agent tools accept the kind through `origin.CheckValue` with no other change; add one sync test (an op with an `obsidian` origin is applied, an `obsidian://new` one is refused and changes nothing) and one REST test (`PATCH /api/v1/tasks/{id}` with the new kind returns 200; with a bad link returns 400 and the error envelope). Verified by `go test ./internal/sync/... ./internal/httpapi/...`.
- [ ] 2.3 MCP and the CLI show the origin label from `Label()`; `ot show` prints `Obsidian: Notes › Daily/2026-10-29.md`. Verified by the CLI's golden output test and `internal/agenttools` origin test gaining an `obsidian` case.

## 3. Web app

- [ ] 3.1 `web/src/lib/taskOrigin.ts`: `obsidianURL(url, id)` (the D2 check), `originLabel` and `originIcon` (`notebook-pen`) for the kind, `openOrigin` opens a valid Obsidian link through a link activation (no new tab) and, in a shell, through `openExternal` only when `has('obsidian-links')`; `ShellCapability` gains `obsidian-links` in `web/src/lib/shell.ts`. Verified by `web/src/lib/taskOrigin.test.ts` running the shared vectors and a test that a `url`-kind `obsidian://` origin and a decrypted `obsidian://new` origin produce no link.
- [ ] 3.2 `OriginChip.tsx` and the panel facet: the tooltip "Open in Obsidian: <vault> › <path>", the chip's menu offers "Copy link" for every origin with a URL. Verified by a happy-dom interaction test (chip activation calls the opener once; in a shell without the capability the menu shows "Copy link" and copying writes the link) and the Storybook story of the chip gaining an Obsidian variant (`make ui-check`).
- [ ] 3.3 Strings ("Open in Obsidian: {vault} › {path}", "Copy link" where not present) in all six locales. Verified by `make i18n-check`.

## 4. Shells

- [ ] 4.1 Android `Bridge.kt`: the external-link check accepts the D2 Obsidian shape and nothing else new; `capabilities` lists `obsidian-links`. Verified by a unit test in `mobile/android` (accepted, the refused vectors) under `make android`.
- [ ] 4.2 iOS `Bridge.safeExternal` the same, `capabilities` lists `obsidian-links`. Verified by `BridgeTests` under `make ios`.
- [ ] 4.3 Bridge fixtures: the Obsidian link the web app hands `openExternal` and the refused ones, read by the web, Android and iOS tests. Verified by the shared-fixture tests on all three.

## 5. Docs and release notes

- [ ] 5.1 `docs/api.md`: the origin object gains the `obsidian` kind with its URL rule; `docs/tasks-and-projects.md` (origin section) names the chip; `docs/vault.md` notes that an `[origin:: obsidian://…]` field is a clickable link in Obsidian. Verified by `npm run docs:check`.
- [ ] 5.2 CHANGELOG entry under Unreleased (done at archive, per `openspec/config.yaml`). Verified by `make check`.
