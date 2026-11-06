---
title: Tests and checks
summary: What make check runs, the CI tiers, how to run one test, the shared fixtures and the screen checks.
audience: developer
section: Contributing
specs: []
screens: []
order: 4
---
# Tests and checks

## make check

`make check` is what CI runs on every pull request. Run it before you push, or at least the parts you touched:

| Target | What it checks |
| --- | --- |
| `make lint` | `go vet` and the web type check |
| `make web-lint` | ESLint: Rules of Hooks, effect dependencies, functions over 250 lines, no fixed waits in tests |
| `make staticcheck` | Go static analysis |
| `make test` | `go test ./...`, the web tests (vitest), the extension and the Obsidian plugin |
| `make fmt-check` | `gofmt` |
| `make ui-lint` | design-system rules: tokens, `<Icon>`, no untranslated English in JSX |
| `make i18n-check` | every catalog complete, placeholders and plurals match |
| `make docs-check` | front matter, links, anchors, images, spec coverage, help screens, the generated roadmap and keyboard guides |
| `make templates-check` | project templates |
| `make openspec-validate` | every spec and change, strict |
| `make deploy-check` | the platform templates under `deploy/` |
| `make repo-check` | repository rules: the migration matrix, shared contracts, budgets, the make targets these pages name, the changelog fragments in `changelog.d/` |

The Go tests that import the embedded web app need it built once: `make web`.

## One test

```sh
go test ./internal/sync -run TestApplyIsIdempotent
cd web && npx vitest run src/lib/ops.test.ts
cd web && npx vitest run -t "keeps the outbox"
```

Web tests never reach the network: mock `fetch` with `mockFetch` from `web/src/ui/test-utils.tsx`. Interaction tests opt into `// @vitest-environment happy-dom` and wait with `waitFor`, never a fixed sleep. Module-level state is reset before each test by `resetModuleState()` (`web/src/lib/moduleState.ts`); a module with a top-level `let` registers with `resettable()`.

The client's sync code also runs against the real server: `npm run test:contract` in `web/`, after `make server`.

## Shared fixtures

Logic that runs both in Go and in TypeScript (recurrence, filters, quick add, encryption, the op schema, …) is pinned by one fixture both test suites read. The list is [Shared contracts](../contracts.md); adding one is [Add a shared contract](add-a-shared-contract.md).

Changing the public surface (a route, a field, an error code, an MCP tool, an `ot` flag) also updates the v1 snapshot: `go test ./internal/httpapi -run TestV1SurfaceIsAdditive -update`. The snapshot may only grow; see [Stability and compatibility](../stability.md).

## Screens

- `make layout-check`: every screen and overlay in a browser, including axe-core accessibility. A new screen or overlay is added to `scripts/e2e-layout.mjs`.
- `make screens`: PNGs of the core screens at 1280×800 and 390×844, light and dark. Run it on `main` with `OUT_DIR=dist/screens-before make screens`, then on your branch, and attach the pairs your change affects.
- `make storybook` and `make ui-check`: the shared components in `web/src/ui`, each with stories.
- `make bundle-budget`: the first load of the web app against `web/bundle-budget.json`.

## CI tiers

A pull request runs the jobs its paths need (`scripts/ci-changes.sh`): the checks always; for code, the web, server and image jobs and one binary; a Chromium layout and end-to-end job when the app or server changes; Storybook checks for `web/src`; Android, extension and Obsidian jobs for their own directories. A change to `web/` also runs the accessibility gate on every real screen.

A push to `main` or a release tag runs every job: WebKit, German and French layouts, all binaries. Every night CI runs the race detector, the upgrade check, the full accessibility matrix, fuzzing and the [performance budgets](../performance.md); a failed night opens an issue labelled `ci-nightly`.
