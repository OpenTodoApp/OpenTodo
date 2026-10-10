# Design

## Context

The server exposes `/api/v1` with cookie and bearer authentication (`internal/httpapi`), token management routes (`GET/POST /tokens`, `DELETE /tokens/{id}`) and collection endpoints whose writes go through `sync.Apply`. Bearer requests are exempt from the Origin check; cookie writes without an `Origin` header are accepted, which lets a non-browser client log in, mint a token and drop the session. No server change is needed. Constraints: no new mandatory configuration, keep the container small, stdlib-first Go, stable surface for scripts.

## Goals / Non-Goals

**Goals:**
- A pleasant terminal client for daily use and a dependable one for scripts.
- Zero server changes; works against any server version from 0.1 on.
- Tiny: stdlib only, one binary per platform, not in the container image.

**Non-Goals:**
- Offline queueing or a local cache (that is the PWA's job; a local-first CLI would duplicate the sync engine).
- Natural-language parsing (see `nlp-quick-add`; revisit when a Go port of the grammar exists).
- A TUI.

## Decisions

### D1. Separate binary `ot`, same module
Chosen: `cmd/ot` with logic in `internal/cli`, built by `make cli` and released by CI for linux/darwin/windows × amd64/arm64. Not added to the Dockerfile.
- Why: the server image must stay minimal; the CLI is used from a laptop or a cron host; a separate binary avoids shipping client code in the server and keeps `opentodo` subcommands (`healthcheck`, `version`) focused on operations.
- Alternative: `opentodo cli ...` subcommand of the server binary. Rejected: couples releases and bloats the image for a feature the container never runs.

### D2. Standard library only
`flag` with a hand-rolled subcommand dispatcher (the pattern already used in `cmd/opentodo`), `net/http`, `encoding/json`, `os/user`-free config paths via `os.UserConfigDir()`, password prompt using `golang.org/x/term` (already an indirect dependency through `x/crypto`; promote to direct, no new module). Table output is plain fixed-width text; colour via ANSI only when stdout is a TTY and `NO_COLOR` is unset.
- Size: ~5 MB stripped per platform. Image and server memory: unchanged.
- Alternative: cobra/viper (adds ~3 MB and transitive dependencies; shell completion is the main gain and is deferred).

### D3. Configuration
`$XDG_CONFIG_HOME/opentodo/config.json` (via `os.UserConfigDir()`), shape `{"default":"home","profiles":{"home":{"url":"https://…","token":"ot_…","output":"table"}}}`. Written with 0600/0700. Precedence: flags > `OPENTODO_URL`/`OPENTODO_TOKEN` > selected profile. `--profile` or `OPENTODO_PROFILE` selects. The token is never echoed; `auth status` shows the token name as reported by `GET /tokens` matched by last-use.

### D4. Login flow
`POST /auth/login` → session cookie (held in memory only) → `POST /tokens {"name":"cli@<hostname>"}` with the cookie and no `Origin` header → `POST /auth/logout` → persist the secret. Rate limits on login apply (10/min/IP); `set-token` is the path for operators who prefer to mint tokens in Settings.

### D5. Reference resolution and client-side date words
Task refs: fetch `GET /tasks` once per command, match full id then unique prefix among non-deleted tasks; ambiguity is a usage error. `--due` words are resolved locally (same rules as the web for `today`, `tomorrow`, weekdays) into the floating `{date, time?}` object, which is the only thing sent. The CLI does not interpret time zones beyond the local calendar date, matching the floating-date model.

### D6. Output contract
`--json` prints API shapes untouched (arrays for lists, the entity for single results, the error envelope for failures) so field names track `docs/api.md` with no CLI-specific mapping. Exit codes 0/1/2/3/4 as specified. Prompts (`rm` confirmation, login) only on a TTY; `--yes` for scripts.

### D7. Data model impact
None. No new fields, no op changes, no server tables. All writes are REST writes and therefore ops with `device: "server"`.

## Risks / Trade-offs

- [Prefix refs change meaning as tasks come and go] → prefix must be unique among non-deleted tasks at call time and ambiguity aborts; scripts should use full ids from `--json`.
- [Listing all tasks for every command is O(n)] → personal data volumes; `List` already powers the web; add `?project_id=` server filters later as a pure optimisation.
- [Tokens on disk] → 0600 file, never printed, `auth logout` revokes server-side; documented alongside the Settings token list.
- [Date words in the CLI drift from the web parser] → kept to a small fixed set; `nlp-quick-add` owns the full grammar.
- [Windows terminal differences] → colour off unless a TTY; paths via `os.UserConfigDir()`; CI builds and runs unit tests on all three OSes.

## Migration Plan

Nothing to migrate; the CLI is additive and optional. Removing it is deleting the binary.

## Open Questions

- Whether to add server-side list filters (`?project_id=`, `?due_before=`) in `http-api` once the CLI shows the need.
- Shell completion (bash/zsh/fish) as a follow-up once the command set settles.
