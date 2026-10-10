# Tasks

## 1. Foundation

- [ ] 1.1 `internal/cli/config.go`: profile file at `os.UserConfigDir()/opentodo/config.json`, precedence flags > env > profile, 0600/0700 permissions; verify `TestConfigPrecedence` and `TestConfigFileMode` (`go test ./...`)
- [ ] 1.2 `internal/cli/client.go`: HTTP client with bearer header, timeout, error envelope decoding, mapping to exit codes 1/3/4; verify `TestExitCodes` against an `httptest` server returning 400, 401 and a closed port
- [ ] 1.3 `cmd/ot/main.go`: subcommand dispatcher, global `--profile`, `--json`, `--server`, help text; verify `ot --help` lists every command and `go vet ./...` passes

## 2. Authentication commands

- [ ] 2.1 `ot login`, `ot auth set-token|status|logout` (login → token `cli@<hostname>` → logout session; password prompt without echo); verify `TestLoginCreatesTokenAndDropsSession` using the real `httpapi` handler in-process (`go test ./...`)
- [ ] 2.2 Failure paths: wrong password exit 3 with server message, revoked token exit 3 with hint, missing config exit 2 with instructions; verify `TestAuthFailures`

## 3. Task commands

- [ ] 3.1 `ot list` with `--inbox|--today|--upcoming|--project|--completed|--all|--limit`, aliases `today|inbox|upcoming`, web-view ordering with overdue first, table renderer; verify `TestListFiltersAndOrdering` with fixed "today"
- [ ] 3.2 `ot add` with `--project|--due|--time|--priority|--label|--note`, local date-word resolution, prints id; verify `TestAddBuildsCorrectBody` and `TestDueWords` (today, tomorrow, weekday rollover)
- [ ] 3.3 `ot edit` incl. `none`/empty clearing, `ot done|reopen|rm` with multi-ref, prefix resolution, `--yes`; verify `TestRefResolution` (full, unique prefix, ambiguous → exit 2, deleted excluded) and `TestRmPromptsOnlyOnTTY`
- [ ] 3.4 Local validation before any request (priority range, time format, date format); verify `TestLocalValidationExit2` asserts no HTTP call is made

## 4. Project, token and export commands

- [ ] 4.1 `ot project list|add|rename|archive|rm`; verify `TestProjectCommands` against the in-process API
- [ ] 4.2 `ot token list|create|revoke` (secret printed once with notice) and `ot export [--out]`; verify `TestTokenAndExport`

## 5. Output contract

- [ ] 5.1 `--json` prints API shapes or the error envelope only; colour and prompts disabled when stdout is not a TTY or `NO_COLOR` is set; verify `TestJSONOutputIsPureAPIShape` and a golden-file test for table output
- [ ] 5.2 End-to-end: script `scripts/cli-smoke.sh` runs setup → login → add → list --json → done → export against a local server; verify it prints "CLI OK" in CI

## 6. Build, release and docs

- [ ] 6.1 `make cli` target and CI matrix cross-compiling `ot` for linux/darwin/windows × amd64/arm64, attached to releases; verify the workflow builds all six binaries and the Dockerfile is unchanged (image size unaffected)
- [ ] 6.2 `docs/cli.md` (install, login, every command, JSON and exit codes, cron example), README section, `docs/api.md` note on the token-creation flow, CHANGELOG under Unreleased; verify links resolve and `make check` passes
