# Contributing to OpenTodo

Thanks for helping build a task manager people can own. This document covers how work flows through the repository.

## Ground rules

- **Specs first.** OpenTodo is spec-driven with [OpenSpec](https://github.com/Fission-AI/OpenSpec). Any change that alters user-visible behavior, the API, the sync protocol or the data model starts as a change under `openspec/changes/<name>/` (proposal, delta specs, design, tasks). Bug fixes and refactors that keep behavior identical do not need a change.
- **Never bypass the op log.** All writes to task and project data, from the UI, the REST API or future integrations, go through field-level ops. See `docs/sync.md`.
- **Additive data model.** Adding fields is fine. Renaming or removing op fields is a breaking change and needs a migration plan in the design doc.
- **Private by default.** No telemetry, no third-party scripts or fonts, no outbound calls the user did not ask for.
- **Small footprint.** New dependencies must justify their size. The server stays a single static binary; the web bundle is measured in CI output.

## Workflow

1. Open an issue or pick one up, so the scope is agreed.
2. Plan the change: `openspec new change <kebab-name>` or, with Claude Code, `/opsx:propose "<idea>"`. Fill `proposal.md`, `specs/<capability>/spec.md`, `design.md` and `tasks.md`. Run `openspec validate <name> --strict`.
3. Implement, ticking tasks as you go (`/opsx:apply` does this for you).
4. Run `make check` (vet, staticcheck, typecheck, the React hooks lint, Go and web tests, OpenSpec validation). A new op field also goes into `internal/sync/testdata/schema_fixture.json`, which the Go and web tests both check.
5. When touching sync or the UI, run the browser smoke test (see `scripts/README.md`). When touching layout or adding a screen or overlay, run the layout check (`make layout-check`, which includes the axe-core accessibility check), and add the new screen or overlay to `scripts/e2e-layout.mjs`.
6. When touching `web/src/app`, capture the core screens before and after: `OUT_DIR=dist/screens-before make screens` on `main`, then `make screens` on your branch (both write PNGs of the seeded demo fixture, at 1280×800 and 390×844 in light and dark; `node scripts/screens.mjs inbox,task-panel` limits the run to some screens). Attach the before/after pairs of the screens your change affects to the pull request. The maintainer reviews them on the images, not the diff: alignment with the page template (header, spacing, chrome rows), both themes, and the phone width.
7. Open a pull request. CI must be green. Link the change folder in the description.
8. Update the documentation with the behaviour: user-visible changes go into the guides in `docs/` (front matter lists the capabilities a page covers in `specs` and the app screens it explains in `screens`). Run `make docs` and commit the regenerated `web/src/generated/help.json`; never edit it by hand. The docs website is built into `dist/docs-site` (not committed) and ships to the website repository in the site bundle (`make site-bundle`). After merging `main` into a branch, rerun `make docs` instead of resolving conflicts in generated files. `make check` runs `npm run docs:check`, which fails on broken links, missing alt text, uncovered capabilities or stale output. Screenshots are refreshed with `make docs-screenshots`; the docs site is checked in a browser with `make docs-site-check`.
9. Text people read goes through the message layer (`t()` in `web/src/lib/i18n`) and into every catalog; `make check` runs the translation checks. See [Translating OpenTodo](docs/translating.md), also for adding a language.
10. Project templates live in `templates/`, one folder per template; [`templates/README.md`](templates/README.md) is the format, the bar for the library and how to try one. `make templates` checks and compiles them; commit the regenerated `web/src/generated/templates.json` with the template.
11. After merge, the change is archived with `openspec archive <name> -y`, which merges its deltas into `openspec/specs/`. Add a line to `CHANGELOG.md`.

## Development setup

Requirements: Go 1.26+, Node 22+, GNU make. Docker is optional.

```bash
make dev            # API on :8080 (go run) + Vite on :5173 with proxy and hot reload
make test           # go test ./... and vitest
make build          # production binary in bin/opentodo with the web app embedded
```

Tests live next to the code: `internal/**/*_test.go` and `web/src/**/*.test.ts`. Web tests never reach the network: `web/src/test-setup.ts` fails a test that calls `fetch` without mocking it (`mockFetch` in `web/src/ui/test-utils.tsx`, or `vi.stubGlobal('fetch', ...)`), and interaction tests wait for what they assert with `waitFor` from the same file rather than a fixed sleep. `make web-lint` (in `make check`) runs ESLint with the Rules of Hooks and effect dependencies as errors; a suppression needs its reason after `--`. It also fails on a component, hook or helper longer than 250 lines (tests and stories excepted): split it into hooks, pure functions in `web/src/lib` and smaller bodies, as `web/src/app/task-list/` does for the task list; the few older long functions are listed in `web/eslint.config.js` with a ceiling that must not go up. The sync engine has order-independence and idempotency tests on both sides; keep them passing and extend them when touching merge logic.

## Code style

- Go: `gofmt`, `go vet`, standard library first. Errors are wrapped with context. Handlers return the JSON error envelope `{ "error": { "code", "message" } }`.
- TypeScript: strict mode, no `any` in non-test code, React function components, Tailwind utility classes. Keep components small; data access goes through `web/src/lib/`. Secondary text uses `text-muted` or `text-faint` (theme-aware tokens in `web/src/index.css` that meet WCAG AA in light and dark) rather than `text-slate-400`/`text-slate-500`; coloured text needs a `dark:` shade too. The layout check runs axe-core on every screen and overlay.
- Overlays: every menu, popover, picker, dialog and toast uses the overlay module in `web/src/ui/overlay/` (exported by the `web/src/ui` barrel) (`Menu`/`Popover`, `Dialog`, `ToastRegion`), never a hand-positioned `absolute`/`fixed` panel or a `<details>` menu (`<details>` is fine for expand/collapse). It gives bottom sheets on phones, viewport-kept popovers above 640 px, full-screen dialogs when tall, Escape, focus return and safe areas.
- Phone layout: nothing may scroll sideways at 360 px except regions marked `data-scroll-x` (board, week grid, wide tables, code); controls are at least 44 × 44 px on touch screens (a global rule covers buttons, inputs and selects; use `touch-target` for icon controls whose visual is smaller); use `hover-reveal` instead of `opacity-0 group-hover:opacity-100`; `user-text` on user-written text so long words wrap; `dvh`, never `vh`.
- Specs: requirements use SHALL; every requirement has at least one `#### Scenario:` with WHEN / THEN.

## Commit messages

Imperative mood, one logical change per commit, reference the OpenSpec change name when applicable, e.g. `sync: clamp future timestamps (bootstrap-core-platform)`.

## License

By contributing you agree that your contributions are licensed under the AGPL-3.0-only, like the rest of the project. Project templates in `templates/` are content and are licensed under CC BY 4.0 (see `templates/README.md`).

## Code of conduct

Taking part in this project means following the [code of conduct](CODE_OF_CONDUCT.md).
