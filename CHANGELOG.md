# Changelog

All notable changes to OpenTodo are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Command-line client `ot` (OpenSpec change `cli-client`): a stdlib-only static binary built from `cmd/ot` that talks to any server over the REST API with a bearer token. `ot login` mints a `cli@<hostname>` token from email and password; profiles live in the user config directory with owner-only permissions and are overridden by `OPENTODO_URL` / `OPENTODO_TOKEN` / `--profile`. Commands: `list` with the web's view filters (aliases `today`, `inbox`, `upcoming`), `add`, `edit`, `done`, `reopen`, `rm` with id-prefix references, `project …`, `token …`, `export`, `auth …`. `--json` prints the API's own shapes; exit codes 0/1/2/3/4. Built by `make cli` and cross-compiled for linux/darwin/windows × amd64/arm64 in CI; not included in the container image. Docs in `docs/cli.md`.
- OpenSpec changes drafted for every roadmap item (35 changes, 33 new capabilities plus deltas to existing ones), all passing strict validation. Nothing is implemented yet; each is a planning artifact for `/opsx:apply`.
- Walking skeleton (OpenSpec change `bootstrap-core-platform`): Go + SQLite server with embedded React PWA, local-first storage, field-level conflict-free sync, owner setup and sessions, API tokens, REST API with write-through to the op log, JSON export, single distroless container, Coolify-ready compose file, CI pipeline.
