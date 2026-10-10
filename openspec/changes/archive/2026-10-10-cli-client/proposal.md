# Proposal

## Why

The REST API and bearer tokens shipped with the core platform, but using them means hand-writing `curl` and `jq`. People who live in a terminal want `ot add "Call the plumber" --due tomorrow` and `ot today`, and scripts, cron jobs, shell aliases and editor integrations want a stable JSON output and exit codes instead of ad-hoc HTTP. A first-party command-line client makes the API a product surface rather than a developer curiosity, and it is the natural client for automation on the same machine the server runs on.

## What Changes

- A new statically linked binary `ot`, built from `cmd/ot` in this repository, that talks to any OpenTodo server over the existing `/api/v1` REST API with a bearer token.
- Commands: `ot login` (creates a named API token from email and password and stores it), `ot auth set-token`, `ot auth status`, `ot auth logout`; `ot list` with view-style filters (`--inbox`, `--today`, `--upcoming`, `--project`, `--completed`, `--all`); `ot add`; `ot done`, `ot reopen`, `ot edit`, `ot rm`; `ot project list|add|rename|archive|rm`; `ot token list|create|revoke`; `ot export`.
- A config file at the platform's user config directory with named profiles (server URL, token, default output), overridable with `OPENTODO_URL`, `OPENTODO_TOKEN` and `--profile`. The token file is written with owner-only permissions.
- `--json` on every command prints exactly the API's entity shapes; human output is a compact table. Stable exit codes distinguish usage errors, API errors, authentication failures and connectivity failures.
- Task references accept a full id or an unambiguous id prefix; `--due` accepts `YYYY-MM-DD`, `today`, `tomorrow` and weekday names, `--time HH:MM`.
- Release assets for linux/darwin/windows on amd64 and arm64 plus `go install`; the server container image does not include the CLI.

Out of scope: an offline queue in the CLI (it is online-only and says so), natural-language parsing of the `add` line (the parser from `nlp-quick-add` lives in the web client; a `--parse` flag may follow once a shared grammar exists), interactive TUI, shell completion scripts beyond what the standard flag package offers, labels and filters beyond the listed options (`labels`, `filter-query-language`), and any new server route.

This change advances ROADMAP.md section 2, "Command-line client" (`cli-client`).

No new environment variables for the server, no server-side changes, no op log changes; nothing is **BREAKING**.

## Capabilities

### New Capabilities
- `cli-client`: configuration and authentication of the command-line client, task and project commands, token management, machine-readable output and exit codes, and its online-only behaviour.

### Modified Capabilities
- none

## Impact

- New Go package `cmd/ot` and `internal/cli` (argument parsing with the standard library, HTTP client, table rendering, config file handling). Standard library only; no new module dependency. Expected binary size about 5 MB stripped per platform. Container image and server runtime memory unchanged because the CLI is not shipped in the image.
- CI: build and test the CLI in `go test ./...`, attach cross-compiled binaries to GitHub releases.
- Docs: new `docs/cli.md`, a section in README, `docs/api.md` cross-reference for the token-creation flow the CLI uses.
