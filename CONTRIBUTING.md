# Contributing to OpenTodo

Thanks for helping build a task manager people can own. This page is the rules; the [contributor guide](docs/contributing/first-contribution.md) is the how-to.

## Contributor guide

| Page | For |
| --- | --- |
| [Your first contribution](docs/contributing/first-contribution.md) | Clone, `make dev`, a `good first issue`, a copy fix end to end in 30 minutes |
| [Architecture tour](docs/contributing/architecture-tour.md) | One task edit from the click to the other device |
| [The OpenSpec workflow](docs/contributing/openspec.md) | When a change needs a proposal, the three commands, what reviewers check |
| [Tests and checks](docs/contributing/tests-and-checks.md) | What `make check` runs, one test, CI tiers, screens |
| [Add a language](docs/contributing/add-a-language.md) | Every file a new interface language touches |
| [Add an importer](docs/contributing/add-an-importer.md) | Profile, signature, sanitiser, fixtures and goldens, switch guide, matrix row |
| [Add a shared contract](docs/contributing/add-a-shared-contract.md) | Logic that must match in Go and TypeScript |

Reference: [Architecture](docs/architecture.md), [Sync protocol](docs/sync.md), [Design system](docs/design-system.md), [Translating](docs/translating.md), [Shared contracts](docs/contracts.md). `AGENTS.md` is the same ground in the dense form AI agents read.

## Ground rules

- **Specs first.** A change that alters user-visible behaviour, the API, the sync protocol or the data model starts as an OpenSpec change under `openspec/changes/<name>/`. Bug fixes and refactors that keep behaviour identical don't need one. See [the workflow](docs/contributing/openspec.md).
- **Never bypass the op log.** Every write to task and project data goes through field-level ops, from the UI, the REST API or any integration ([sync protocol](docs/sync.md)).
- **Additive data model.** Adding fields is fine. Renaming or removing an op field is a breaking change and needs a migration plan in the design.
- **The v1 surface only grows.** Routes, fields, error codes, MCP tools and `ot` flags are kept within 1.x ([stability](docs/stability.md)).
- **Private by default.** No telemetry, no third-party scripts or fonts, no outbound request the user did not configure.
- **Small footprint.** A new dependency justifies its size. The server stays one static binary; the web app's first load has a budget.

## Workflow

1. Open an issue or pick one up, so the scope is agreed.
2. For a behaviour change, plan it as an OpenSpec change (`/opsx:propose "<idea>"` with Claude Code, or by hand).
3. Implement it, ticking `tasks.md` as you go. Update the user docs in `docs/` with the behaviour, and run `make docs`; commit the regenerated `web/src/generated/help.json`, never edit it by hand.
4. Text people read goes through `t()` and into every catalog ([Translating](docs/translating.md)).
5. Run `make check` ([what it runs](docs/contributing/tests-and-checks.md)).
6. Open the pull request. The change is archived in the pull request that finishes it, with a `CHANGELOG.md` line.

Project templates live in `templates/`; [`templates/README.md`](templates/README.md) has the format and the bar.

## Pull requests

- **One change per pull request.** One OpenSpec change, one fix or one docs topic. A large change may be split into several pull requests by area; each one passes CI on its own.
- **Green CI.** A pull request is merged only when every check passes.
- **Link the issue** with `Fixes #123` when the pull request closes it, and the change folder when there is one.
- **Screens:** a change to `web/src/app` attaches before and after screenshots of the screens it affects ([how](docs/contributing/tests-and-checks.md#screens)).
- **Accessibility** ([statement](docs/accessibility.md)): a new screen or overlay goes into the screen inventory (`scripts/ux-audit/screens.json`), which the accessibility gate opens on every pull request (run it locally: `make build && A11Y_ONLY=1 WIDTHS=360,1280 LANGS=en node scripts/ux-audit/tour.mjs`), then `node scripts/accessibility-statement.mjs` adds it to the statement. A new drag, resize or swipe needs a way to do the same with one click or tap: a `data-drag-id` on its element and an entry in `scripts/ux-audit/drag-alternatives.json` naming the menu item or control that does it (`MoveHandle` for a short list without a menu); `web/src/lib/a11y/dragAlternatives.test.ts` fails until then.
- **Commits** are in the imperative mood, one logical change each, naming the OpenSpec change when there is one: `sync: clamp future timestamps (bootstrap-core-platform)`.
- **Trailers** credit everyone who wrote the commit, people and AI tools alike:

  ```text
  Co-Authored-By: Name <email>
  ```

## How AI agents are used

Most of OpenTodo's code, specs and docs are written by AI coding agents (mostly Claude, through Claude Code) working for the maintainer, who sets the direction, decides what ships and owns the result. You can see it in the history: those commits carry a `Co-Authored-By: Claude …` trailer and a link to the session.

What keeps that trustworthy is the same for every contributor, human or not:

- Behaviour is specified before it is built, and the spec is reviewed.
- Every pull request passes the same checks: tests, the shared Go and TypeScript fixtures, the accessibility gate, the v1 surface snapshot, the docs check.
- An agent opens, reviews and merges the maintainer's own pull requests and dependency updates once CI is green. Pull requests from other contributors get a review, often drafted by an agent, and are merged by the maintainer, never by an agent.
- Translations are never machine-made: a speaker of each language reviews its catalog.
- Security reports go to a person ([SECURITY.md](SECURITY.md)).

You may use AI tools for your contribution. Say so with a `Co-Authored-By` trailer, read and understand every line you submit, and expect the same review as any other pull request. `AGENTS.md` (read by Claude Code through `CLAUDE.md`, and by other agents directly) gives an agent the rules above.

## Code style

- Go: `gofmt`, `go vet`, standard library first. Errors are wrapped with context. Handlers return the JSON error envelope `{ "error": { "code", "message" } }`. Functions stay under 150 lines and files under 1,100.
- TypeScript: strict mode, no `any` outside tests, function components, Tailwind utility classes, data access only through `web/src/lib/`. Components, hooks and helpers stay under 250 lines. Colours, type, radius, elevation and motion come from the tokens in `web/src/index.css`.
- Overlays: every menu, popover, picker, dialog and toast uses the overlay module in `web/src/ui/overlay/` (`Menu`/`Popover`, `Dialog`, `ToastRegion`), never a hand-positioned panel. It gives bottom sheets on phones, Escape, focus return and safe areas.
- Phone layout: nothing scrolls sideways at 360 px except regions marked `data-scroll-x`; touch targets are at least 44 × 44 px; `dvh`, never `vh`; `user-text` on user-written text.
- Specs: requirements use SHALL; every requirement has at least one `#### Scenario:` with WHEN and THEN.

## Releases

Maintainers cut releases with `make release-prepare VERSION=x.y.z` and a `v*` tag; [RELEASING.md](RELEASING.md) has the whole flow.

## License

By contributing you agree that your contributions are licensed under the AGPL-3.0-only, like the rest of the project. Project templates in `templates/` are content and are licensed under CC BY 4.0 (see `templates/README.md`).

## Code of conduct

Taking part in this project means following the [code of conduct](CODE_OF_CONDUCT.md).
