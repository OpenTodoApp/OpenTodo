# Tasks

## 1. Screens and coverage

- [ ] 1.1 `web/src/app/screens.ts` with `SCREEN_IDS` and a unit test that every router route and Settings section is listed; verify `npm test`
- [ ] 1.2 The docs build writes `web/src/generated/screen-ids.json`, and `docs:check` fails for an undeclared id; add `screens:` front matter to the pages that lack it until the check passes; verify `make docs-check`
- [ ] 1.3 An `#export` heading check for `docs/switch/*.md`; verify `make docs-check` fails on a guide without it

## 2. Self-hosting

- [ ] 2.1 `docs/self-hosting/README.md`, the eight-section handbook, with the install table linking every platform page and a check for orphan platform pages; verify `make docs-check`
- [ ] 2.2 Restore drill steps, tried once on a scratch Docker container and recorded with the date in the page; verify by running the drill
- [ ] 2.3 `docs/self-hosting/configuration.md` and the `go/parser` test in `internal/config` (read but not listed, listed but not read); verify `go test ./internal/config/...` and that it fails on a temporary undocumented `os.Getenv("OPENTODO_X")`
- [ ] 2.4 Sizing section with the numbers measured by `performance-10k`, and the upgrading section linking the `stability-contract` policy page; verify `make docs-check`

## 3. API reference

- [ ] 3.1 Error code table in `docs/api.md` and the both-ways test against `web/src/lib/i18n/server-error-codes.json` in `api_docs_test.go`; verify `go test ./internal/httpapi -run APIDocs`
- [ ] 3.2 The `<!-- run -->` example runner with a seeded owner, task and project; at least one example per route group, plus a 401 and a 400 example; verify `go test ./internal/httpapi -run APIExamples` and that a wrong documented status fails

## 4. Contributors

- [ ] 4.1 `docs/contributing/` with the seven pages (design D5), linked from `CONTRIBUTING.md` and from `AGENTS.md`; verify `make docs-check`
- [ ] 4.2 A repo check that every `make <target>` named in `docs/contributing/*.md` and `CONTRIBUTING.md` exists in the `Makefile`; verify `make repo-check`

## 5. Roadmap page

- [ ] 5.1 The docs build generates `docs/roadmap.md` content from ROADMAP.md tables, OpenSpec folders, task checkboxes and CHANGELOG.md; verify a unit test over a small fixture tree (archived, in progress, planned, missing folder)
- [ ] 5.2 Help: an "About" group in the full guide list with Roadmap, strings in the six languages (seven once `more-languages` lands); verify `npm test`, `make i18n-check`, `npm run build`
- [ ] 5.3 Staleness check in `docs:check`; verify it fails after checking a task box without rebuilding

## 6. Release

- [ ] 6.1 `make release-prepare` for 1.0.0 and later fails when the newest `docs/images/*.webp` predates the last commit touching `web/src/app`; verify with a dry run
- [ ] 6.2 Regenerate every screenshot with `make docs-screenshots` on the release candidate
- [ ] 6.3 CHANGELOG entry under Unreleased; `make check` (TZ=UTC) passes
